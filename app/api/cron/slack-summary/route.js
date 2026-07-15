import { NextResponse } from 'next/server';
import { getReports, getSyncedMatrices } from '@/lib/googleSheets';
import { postToSlack, computeStats, buildSummaryBlocks } from '@/lib/slack';

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

  // Only process dashboards where Column I = yes/y/1
  const slackReports = reports.filter((r) => r.slackNotify);
  if (!slackReports.length) {
    return NextResponse.json({ ok: true, message: 'No dashboards have Slack Notify = yes', todayIso });
  }

  const sent = [];
  const errors = [];

  for (const report of slackReports) {
    try {
      const matrices = await getSyncedMatrices(report.row);
      if (!Object.keys(matrices).length) {
        errors.push({ report: report.name, error: 'No synced data found — run Sync first' });
        continue;
      }
      const stats = computeStats(matrices, todayIso, report.slackMetrics);
      if (!Object.keys(stats).length) {
        errors.push({ report: report.name, error: `No metrics matched "${report.slackMetrics}"` });
        continue;
      }
      const blocks = buildSummaryBlocks(report.name, stats, todayIso);
      await postToSlack(blocks, `${report.name} · End of Day Summary`);
      sent.push(report.name);
    } catch (err) {
      errors.push({ report: report.name, error: err.message });
    }
  }

  return NextResponse.json({ ok: true, sent, errors, todayIso });
}
