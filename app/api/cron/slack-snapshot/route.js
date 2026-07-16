import { NextResponse } from 'next/server';
import { getReports, getSyncedMatrices } from '@/lib/googleSheets';
import { postToSlack, computeStats, buildSnapshotBlocks, buildABBlocks, buildGroupTableBlocks } from '@/lib/slack';

export const maxDuration = 60;

function authOk(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const authHeader = req.headers.get('authorization');
  const urlSecret = new URL(req.url).searchParams.get('secret');
  return authHeader === `Bearer ${secret}` || urlSecret === secret;
}

export async function GET(req) {
  if (!authOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const todayIso = new Date().toISOString().slice(0, 10);
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
      if (report.slackGroup) {
        if (processedGroups.has(report.slackGroup)) continue;
        processedGroups.add(report.slackGroup);
        const group = groupedReports[report.slackGroup];
        const reportsData = [];
        for (const r of group) {
          const matrices = await getSyncedMatrices(r.row);
          if (!Object.keys(matrices).length) continue;
          const stats = computeStats(matrices, todayIso, r.slackMetrics);
          const segmentName = r.name.replace(/^.*?(Group|Offline|Personal|Web|iOS|Android)/i, '$1');
          reportsData.push({ segmentName, stats });
        }
        if (!reportsData.length) continue;
        const groupTitle = group[0].name.replace(/(Group|Offline|Personal|Web|iOS|Android).*$/i, '').trim();
        const blocks = buildGroupTableBlocks(groupTitle, reportsData, '7d');
        await postToSlack(blocks, `${groupTitle} snapshot`);
        sent.push(report.slackGroup);
        continue;
      }

      if (report.slackFormat === 'ab') {
        // Skip A/B from snapshots — only in end-of-day summary
        continue;
      }

      const matrices = await getSyncedMatrices(report.row);
      if (!Object.keys(matrices).length) {
        errors.push({ report: report.name, error: 'No synced data' });
        continue;
      }
      const stats = computeStats(matrices, todayIso, report.slackMetrics);
      if (!Object.keys(stats).length) continue;
      const blocks = buildSnapshotBlocks(report.name, stats, todayIso);
      await postToSlack(blocks, `${report.name} snapshot`);
      sent.push(report.name);
    } catch (err) {
      errors.push({ report: report.name, error: err.message });
    }
  }

  return NextResponse.json({ ok: true, sent, errors, todayIso });
}
