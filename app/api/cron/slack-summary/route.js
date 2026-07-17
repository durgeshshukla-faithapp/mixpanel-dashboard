import { NextResponse } from 'next/server';
import { getReports, getSyncedMatrices } from '@/lib/googleSheets';
import {
  extractReportId, fetchMixpanelReport, buildAllMatrices, pruneEmptySources
} from '@/lib/mixpanel';
import {
  postToSlack, computeStats,
  buildSummaryBlocks, buildGroupTableBlocks,
} from '@/lib/slack';
import { fetchAndBuildABBlocks } from '@/lib/slackAB';

export const maxDuration = 60;

function authOk(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const authHeader = req.headers.get('authorization');
  const urlSecret = new URL(req.url).searchParams.get('secret');
  return authHeader === `Bearer ${secret}` || urlSecret === secret;
}

// Fetches LIVE data from Mixpanel for a report (accurate end-of-day data)
// Falls back to synced Sheet data if Mixpanel fails (rate limit etc.)
async function getLiveMatrices(report) {
  const reportId = extractReportId(report.link);
  if (!reportId) throw new Error('Could not parse report ID');

  try {
    const raw = await fetchMixpanelReport(reportId);
    const { matrices } = buildAllMatrices(raw);
    return pruneEmptySources(matrices);
  } catch (err) {
    // Rate limit or API error — fall back to synced data
    if (/429|rate.?limit/i.test(err.message)) {
      console.warn(`[slack-summary] Rate limited for ${report.name}, falling back to synced data`);
      return await getSyncedMatrices(report.row);
    }
    throw err;
  }
}

export async function GET(req) {
  if (!authOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Use IST (UTC+5:30) for "today" since SoulSensei is India-based
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

  const groupedReports = {};
  slackReports.forEach((r) => {
    if (r.slackGroup) {
      if (!groupedReports[r.slackGroup]) groupedReports[r.slackGroup] = [];
      groupedReports[r.slackGroup].push(r);
    }
  });

  for (const report of slackReports) {
    try {
      // ── Grouped table (PDP Rails / Slots) ──
      if (report.slackGroup) {
        if (processedGroups.has(report.slackGroup)) continue;
        processedGroups.add(report.slackGroup);

        const group = groupedReports[report.slackGroup];
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

      // ── A/B format ──
      if (report.slackFormat === 'ab') {
        const reportId = extractReportId(report.link);
        if (!reportId) throw new Error('Could not parse report ID');
        const blocks = await fetchAndBuildABBlocks(reportId, report.name);
        await postToSlack(blocks, `${report.name} A/B`);
        sent.push(report.name);
        continue;
      }

      // ── Normal end-of-day: LIVE Mixpanel data ──
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

    } catch (err) {
      errors.push({ report: report.name, error: err.message });
    }
  }

  return NextResponse.json({ ok: true, sent, errors, todayIso });
}
