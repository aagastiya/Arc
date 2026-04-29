// Arc per-article generator endpoint
// POST /api/arc/generate?id=<article_uuid>
// Fetches one article by ID, generates Arc-voice content via OpenAI,
// and saves it as a draft (is_live=false) in the stories table.

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const ARC_VOICE_PROMPT = `You are Arc, a calm and clear news writer for young readers in India.

Your voice rules:
- Calm, never breathless. No "BREAKING", no all caps, no urgency words.
- Plain English. Short sentences. The reading level of a smart 18-year-old.
- Fact-first. What happened, then context, then what's next.
- Neutral. No opinion words like "shocking", "outrageous", "stunning".
- Do not give the reader advice. Do not tell them to stay safe, stay hydrated, stay informed, etc.
- Warmer than Reuters, more disciplined than BuzzFeed. Like a sharp friend explaining news over coffee.

Given a news article, return ONLY valid JSON in this exact shape, with no extra prose, no markdown, no code fences:

{
  "arc_headline": "an 8 to 12 word headline in Arc voice",
  "arc_summary": "a 60 word summary in Arc voice. What happened, the context behind it, and what to watch next.",
  "arc_storyline": [
    { "date": "YYYY or YYYY-MM or YYYY-MM-DD or a year range like 2015-2019", "event": "one short sentence describing what happened on that date" }
  ]
}

Storyline rules:
- Only include events you are confident actually happened, with real dates.
- If you do not know enough to build a multi-event storyline, return an array with just today's event using the article's published date.
- Do not invent events. Do not guess. If unsure, return fewer events.
- Order events oldest first.`;

export async function POST(request: Request) {
  try {
    // 1. Get article ID from query string
    const { searchParams } = new URL(request.url);
    const articleId = searchParams.get("id");

    if (!articleId) {
      return NextResponse.json(
        { error: "Missing article id. Use ?id=<uuid>" },
        { status: 400 }
      );
    }

    // 2. Fetch the article from Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: article, error: fetchError } = await supabase
      .from("articles")
      .select("*")
      .eq("id", articleId)
      .single();

    if (fetchError || !article) {
      return NextResponse.json(
        { error: "Article not found", details: fetchError?.message },
        { status: 404 }
      );
    }

    // 3. Build the user message for OpenAI
    const userMessage = `Title: ${article.title}
Summary: ${article.summary || "(no summary available)"}
Category: ${article.category || "general"}
Published: ${article.published_at || "unknown"}
Source: ${article.source_name || "unknown"}`;

    // 4. Call OpenAI
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: ARC_VOICE_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.4,
      response_format: { type: "json_object" },
    });

    const rawResponse = completion.choices[0]?.message?.content;

    if (!rawResponse) {
      return NextResponse.json(
        { error: "OpenAI returned empty response" },
        { status: 500 }
      );
    }

    // 5. Parse and validate the AI response
    let parsed;
    try {
      parsed = JSON.parse(rawResponse);
    } catch {
      return NextResponse.json(
        { error: "OpenAI returned invalid JSON", raw: rawResponse },
        { status: 500 }
      );
    }

    const arcHeadline = parsed.arc_headline;
    const arcSummary = parsed.arc_summary;
    const arcStoryline = Array.isArray(parsed.arc_storyline)
      ? parsed.arc_storyline
      : [];

    if (!arcHeadline || !arcSummary) {
      return NextResponse.json(
        { error: "AI response missing required fields", parsed },
        { status: 500 }
      );
    }

    // 6. Upsert into stories table as draft
    const { data: savedStory, error: saveError } = await supabase
      .from("stories")
      .upsert(
        {
          article_id: articleId,
          arc_headline: arcHeadline,
          arc_summary: arcSummary,
          arc_storyline: arcStoryline,
          category: article.category || "today",
          is_live: false,
        },
        { onConflict: "article_id" }
      )
      .select()
      .single();

    if (saveError) {
      return NextResponse.json(
        { error: "Failed to save story", details: saveError.message },
        { status: 500 }
      );
    }

    // 7. Return everything for inspection
    return NextResponse.json({
      original: {
        id: article.id,
        title: article.title,
        summary: article.summary,
        link: article.link,
        category: article.category,
        published_at: article.published_at,
      },
      arc: {
        arc_headline: arcHeadline,
        arc_summary: arcSummary,
        arc_storyline: arcStoryline,
      },
      saved_story: savedStory,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Unexpected failure", details: message },
      { status: 500 }
    );
  }
}
