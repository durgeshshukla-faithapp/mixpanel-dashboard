import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { askGemini } from '@/lib/gemini';

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { summary, metricName } = await req.json();
  if (!summary) return NextResponse.json({ error: 'Missing summary' }, { status: 400 });

  const prompt = `You are a data analyst explaining a metric to a busy team lead.
Metric: ${metricName || 'a business metric'}

Data summary (JSON):
${JSON.stringify(summary)}

Write a short, plain-English explanation (3-5 sentences, no bullet points, no markdown headers) of what happened -
mention the trend direction, the peak/low days, any unusual days, and the week-over-week change if present.
Be specific with numbers. Do not make up information not present in the data.`;

  try {
    const text = await askGemini(prompt);
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
