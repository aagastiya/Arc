// Arc voice test endpoint
// POST /api/arc/test-summarize?cat=india  (or ?cat=tech, ?cat=world, etc.)
// Picks one article from Supabase, asks OpenAI to write Arc-voice content, returns both.

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const ARC_VOICE_PROMPT = `You are Arc, a calm and clear news writer for young readers in India.

Your voice rules:
- Calm, never breathless. No "BREAKING", no all caps, no urgency words.
- Plain English. Short sentences. The reading level of a smart 18-year-old.
- Fact-first. What happened, then context, then what's next.
- Neutral. No opinion words like "shocking", "outrageous", "stunning".
- Do not give the reader advice. Do not tell them to stay safe, stay hydrated, stay informed. Just state what happened.
- Warmer than Reuters, more disciplined than BuzzFeed. Like a sharp friend explaining news at a coffee shop.

Given a news article, return ONLY valid JSON in this exact shape, with no extra prose, no markdown fences, no explanation:

{
  "arc_headline": "an 8 to 12 word headline in Arc voice",
  "arc_summary": "a 60 word summary in Arc voice. What happened, the context behind it, and what to watch next.",
  "arc_storyline": [
    { "date": "YYYY or YYYY-MM or YYYY-MM-DD or a year range like 2015-2019", "event": "one short sentence describing what happened on this date, in Arc voice" }
  ]
}

Storyline rules:
- The storyline is an ARRAY of dated events that explain the longer story this article is part of.
- Order events chronologically, oldest first, with the most recent event being today's article.
- Include 3 to 7 events. Less is fine if you don't have confident knowledge of more.
- Each event needs a date you are confident about. Use whatever precision you actually know — a year, a month, a day, or a range.
- If you don't know enough confident dated events to build a real storyline, return an empty array: "arc_storyline": []. Do NOT invent events you are not sure about. An honest empty storyline is better than a hallucinated one.
- The today's event in the storyline should restate the article's core fact in one short Arc-voice sentence.

Example of a good storyline (for context, not output):
[
  { "date": "2011-2012", "event": "Joins the Anna Hazare-led anti-corruption movement" },
  { "date": "2019", "event": "Loses South Delhi Lok Sabha seat to BJP candidate" },
  { "date": "2022", "event": "Elected to the Rajya Sabha from Punjab" },
  { "date": "2026-04-27", "event": "Removed as Rajya Sabha deputy leader, quits party" }
]`;

export async function POST(request: Request) {
  try {
    // 0. Read optional category filter from URL: ?cat=india
    const url = new URL(request.url);
    const category = url.searchParams.get("cat");

    // 1. Connect to Supabase using the service role key (server-side only)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Missing Supabase env vars" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // 2. Fetch one article. If a category is given, filter by it. Otherwise most recent overall.
    let query = supabase
      .from("articles")
      .select("id, title, summary, link, category, published_at")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(1);

    if (category) {
      query = query.eq("category", category);
    }

    const { data: articles, error: fetchError } = await query;

    if (fetchError) {
      return NextResponse.json(
        { error: "Supabase fetch failed", details: fetchError.message },
        { status: 500 }
      );
    }

    if (!articles || articles.length === 0) {
      return NextResponse.json(
        {
          error: category
            ? `No articles found in category '${category}'`
            : "No articles found in database",
        },
        { status: 404 }
      );
    }

    const article = articles[0];

    // 3. Send the article to OpenAI
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey: openaiKey });

    const userMessage = `Article title: ${article.title}

Article summary: ${article.summary ?? "(no summary available)"}

Article category: ${article.category ?? "unknown"}

Article published date: ${article.published_at ?? "unknown"}

Now produce the Arc voice JSON for this article.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: ARC_VOICE_PROMPT },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
    });

    const rawContent = completion.choices[0]?.message?.content ?? "{}";

    let arcOutput: unknown;
    try {
      arcOutput = JSON.parse(rawContent);
    } catch {
      return NextResponse.json(
        {
          error: "OpenAI returned non-JSON",
          raw: rawContent,
        },
        { status: 500 }
      );
    }

    // 4. Return original article alongside Arc output for comparison
    return NextResponse.json({
      original: {
        title: article.title,
        summary: article.summary,
        link: article.link,
        category: article.category,
        published_at: article.published_at,
      },
      arc: arcOutput,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Unexpected failure", details: message },
      { status: 500 }
    );
  }
}