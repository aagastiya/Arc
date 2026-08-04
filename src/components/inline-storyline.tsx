"use client";

import {
  StorylineCards,
  type StorylineBeat,
  type StorylineKeyPoint,
  type StorylineReport,
} from "@/components/storyline-cards";

export type InlineStorylineProps = {
  headline: string;
  summary: string;
  category: string;
  coverImageUrl: string | null;
  keyPoints: StorylineKeyPoint[];
  report: StorylineReport | null;
  storyline: StorylineBeat[];
};

/** Reader storyline panel — real story data only (card stack). */
export function InlineStoryline(props: InlineStorylineProps) {
  return <StorylineCards {...props} />;
}
