import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { askGemini } from '@/lib/gemini';

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { question, context, history } = await req.json();
  if (!question) return NextResponse.json({ error: 'Missing question' }, { status: 400 });

  const historyText = (history || [])
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n');

  const prompt = `You are a data analyst assistant answering questions about a dashboard.
Only use the data provided below - if the answer isn't in the data, say so honestly, don't guess.

Dashboard data (JSON, dates as YYYY-MM-DD):
${JSON.stringify(context).slice(0, 100000)}

${historyText ? 'Recent conversation:\n' + historyText + '\n' : ''}
User question: ${question}

Answer concisely (2-4 sentences), citing specific numbers/dates from the data where relevant.`;

  try {
    const text = await askGemini(prompt);
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
