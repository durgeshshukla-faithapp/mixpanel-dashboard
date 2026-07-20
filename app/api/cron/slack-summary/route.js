import { NextResponse } from 'next/server';
import { getReports, getSyncedMatrices, saveFunnelSnapshot, getFunnelBaseline } from '@/lib/googleSheets';
import {
  extractReportId, fetchMixpanelReport, fetchMixpanelABReport, buildAllMatrices, pruneEmptySources
} from '@/lib/mixpanel';
import {
  postToSlack, computeStats,
  buildSummaryBlocks, buildGroupTableBlocks,
  buildFunnelSummaryBlocks, buildFunnelComparisonBlocks,
} from '@/lib/slack';
import { fetchAndBuildABBlocks } from '@/lib/slackAB';

export const maxDuration = 60;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function authOk(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const authHeader = req.headers.get('authorization');
  const urlSecret = new URL(req.url).searchParams.get('secret');
  return authHeader === `Bearer ${secret}` || urlSecret === secret;
}

// Live Mixpanel data with retry on 429 and fallback to synced Sheet data
async function getLiveMatrices(report) {
  const reportId = extractReportId(report.link);
  if (!reportId) throw new Error('Could not parse report ID');

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await fetchMixpanelReport(reportId);
      const { matrices } = buildAllMatrices(raw);
      return pruneEmptySources(matrices);
    } catch (err) {
      if (/429|rate.?limit/i.test(err.message)) {
        if (attempt === 0) {
          console.warn(`[slack-summary] Rate limited for ${report.name}, waiting 10s before retry`);
          await sleep(10000);
          continue;
        }
        // After retry, fall back to synced Sheet data
        console.warn(`[slack-summary] Rate limit retry failed for ${report.name}, using synced data`);
        return await getSyncedMatrices(report.row);
      }
      throw err;
    }
  }
  return {};
}

export async function GET(req) {
  if (!authOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const todayIso = nowIST.toISOString().slice(0, 10);

  const reports = await getReports();
  const slackReports = reports.filter((r) => r.slackNotify);

  if (!slackReports.length) {
    return NextResponse.json({ ok: true, message: 'No dashboards have Slack Notify = yes', todayIso });
  }

  const sent = [];
  const errors = [];
  const processedGroups = new Set();

  for (const report of slackReports) {
    try {
      // ────────────────────────────────────────────────────────────────────
      // Route by slackFormat FIRST (not slackGroup) so funnel + AB reports
      // never accidentally fall into the time-series group_row path
      // ────────────────────────────────────────────────────────────────────

      // ── A/B format (live from Mixpanel, no dates needed) ──
      if (report.slackFormat === 'ab') {
        const reportId = extractReportId(report.link);
        if (!reportId) throw new Error('Could not parse report ID');
        const blocks = await fetchAndBuildABBlocks(reportId, report.name);
        await postToSlack(blocks, `${report.name} A/B`);
        sent.push(report.name);
        continue;
      }

      // ── Funnel summary + comparison (single values per step, no dates) ──
      if (report.slackFormat === 'funnel_summary') {
        // Combined: multiple funnels with same slackGroup → one comparison table
        if (report.slackGroup) {
          if (processedGroups.has(report.slackGroup)) continue;
          processedGroups.add(report.slackGroup);

          const group = slackReports.filter((r) =>
            r.slackFormat === 'funnel_summary' && r.slackGroup === report.slackGroup
          );
          const funnelsData = [];
          for (const r of group) {
            const reportId = extractReportId(r.link);
            if (!reportId) continue;
            try {
              // fetchMixpanelABReport hits /query/report which returns { results: {...} }
              // where each metric maps to { rows: [[value]] } — perfect for funnels
              const results = await fetchMixpanelABReport(reportId);
              funnelsData.push({ name: r.name, results });
              // Snapshot today for tomorrow's drop-detection baseline
              await saveFunnelSnapshot(r.row, todayIso, results);
            } catch (err) {
              errors.push({ report: r.name, error: err.message });
            }
          }
          if (funnelsData.length === 0) continue;
          const groupTitle = report.slackGroup.toUpperCase().replace(/_/g, ' ') + ' comparison';
          const blocks = buildFunnelComparisonBlocks(groupTitle, funnelsData);
          await postToSlack(blocks, groupTitle);
          sent.push(report.slackGroup);
          continue;
        }

        // Single funnel (no group) — send its own message with worst-step + drop alerts
        const reportId = extractReportId(report.link);
        if (!reportId) throw new Error('Could not parse report ID');
        const results = await fetchMixpanelABReport(reportId);
        const baseline = await getFunnelBaseline(report.row, todayIso);
        const blocks = buildFunnelSummaryBlocks(report.name, results, baseline);
        await postToSlack(blocks, `${report.name} · Funnel Summary`);
        await saveFunnelSnapshot(report.row, todayIso, results);
        sent.push(report.name);
        continue;
      }

      // ── Time-series grouped table (PDP Rails / Slots style) ──
      // Only reports WITHOUT ab/funnel_summary format land here
      if (report.slackGroup) {
        if (processedGroups.has(report.slackGroup)) continue;
        processedGroups.add(report.slackGroup);

        const group = slackReports.filter((r) =>
          !r.slackFormat && r.slackGroup === report.slackGroup
        );
        const reportsData = [];
        for (const r of group) {
          const matrices = await getLiveMatrices(r);
          if (!Object.keys(matrices).length) continue;
          const stats = computeStats(matrices, todayIso, r.slackMetrics);
          const segmentName = r.name.replace(/^.*?(Group|Offline|Personal|Web|iOS|Android)/i, '$1');
          reportsData.push({ segmentName, stats });
        }
        if (!reportsData.length) continue;
        const groupTitle = group[0].name.replace(/(Group|Offline|Personal|Web|iOS|Android).*$/i, '').trim();
        const cmpKey = report.slackFormat === 'group_30d' ? '30d' : '7d';
        const blocks = buildGroupTableBlocks(groupTitle, reportsData, cmpKey);
        await postToSlack(blocks, `${groupTitle} summary`);
        sent.push(report.slackGroup);
        continue;
      }

      // ── Normal end-of-day (time-series, live Mixpanel) ──
      const matrices = await getLiveMatrices(report);
      if (!Object.keys(matrices).length) {
        errors.push({ report: report.name, error: 'No data returned from Mixpanel' });
        continue;
      }
      const stats = computeStats(matrices, todayIso, report.slackMetrics, report.goals || {});
      if (!Object.keys(stats).length) {
        errors.push({ report: report.name, error: `No metrics matched "${report.slackMetrics}"` });
        continue;
      }
      const blocks = buildSummaryBlocks(report.name, stats, todayIso);
      await postToSlack(blocks, `${report.name} · End of Day`);
      sent.push(report.name);

      // Small delay between each report to stay within Mixpanel's rate limit
      await sleep(1500);

    } catch (err) {
      errors.push({ report: report.name, error: err.message });
    }
  }

  return NextResponse.json({ ok: true, sent, errors, todayIso });
}
