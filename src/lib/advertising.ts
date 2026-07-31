import { supabase } from "@/integrations/supabase/client";
import type { Category } from "@/data/content";

export type CampaignStatus =
  | "draft"
  | "pending_review"
  | "active"
  | "paused"
  | "completed"
  | "rejected";

export type Advertiser = {
  id: string;
  owner_id: string;
  company_name: string;
  contact_email: string;
  country: string | null;
  website: string | null;
  is_approved: boolean;
};

export type Campaign = {
  id: string;
  advertiser_id: string;
  name: string;
  headline: string | null;
  description: string | null;
  destination_url: string | null;
  budget: number;
  spent: number;
  cost_per_view: number;
  cost_per_click: number;
  target_countries: string[];
  target_categories: Category[];
  status: CampaignStatus;
  created_at: string;
};

const CAMPAIGN_SELECT =
  "id,advertiser_id,name,headline,description,destination_url,budget,spent,cost_per_view,cost_per_click,target_countries,target_categories,status,created_at";

function toCampaign(row: Record<string, unknown>): Campaign {
  return {
    id: row.id as string,
    advertiser_id: row.advertiser_id as string,
    name: row.name as string,
    headline: (row.headline as string) ?? null,
    description: (row.description as string) ?? null,
    destination_url: (row.destination_url as string) ?? null,
    budget: Number(row.budget ?? 0),
    spent: Number(row.spent ?? 0),
    cost_per_view: Number(row.cost_per_view ?? 0),
    cost_per_click: Number(row.cost_per_click ?? 0),
    target_countries: (row.target_countries as string[]) ?? [],
    target_categories: (row.target_categories as Category[]) ?? [],
    status: row.status as CampaignStatus,
    created_at: row.created_at as string,
  };
}

export async function fetchMyAdvertiser(userId: string): Promise<Advertiser | null> {
  const { data, error } = await supabase
    .from("advertisers")
    .select("id,owner_id,company_name,contact_email,country,website,is_approved")
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function createAdvertiser(input: {
  ownerId: string;
  companyName: string;
  contactEmail: string;
  country?: string | null;
  website?: string | null;
}): Promise<Advertiser> {
  const companyName = input.companyName.trim();
  const contactEmail = input.contactEmail.trim();
  if (companyName.length < 2 || companyName.length > 120) throw new Error("Company name must be 2–120 characters");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) throw new Error("Enter a valid contact email");

  const { data, error } = await supabase
    .from("advertisers")
    .insert({
      owner_id: input.ownerId,
      company_name: companyName,
      contact_email: contactEmail,
      country: input.country?.trim() || null,
      website: input.website?.trim() || null,
    })
    .select("id,owner_id,company_name,contact_email,country,website,is_approved")
    .single();
  if (error) throw error;
  return data;
}

export async function fetchCampaigns(advertiserId: string): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from("ad_campaigns")
    .select(CAMPAIGN_SELECT)
    .eq("advertiser_id", advertiserId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => toCampaign(r as Record<string, unknown>));
}

export async function createCampaign(input: {
  advertiserId: string;
  name: string;
  headline?: string;
  description?: string;
  destinationUrl?: string;
  budget: number;
  costPerView: number;
  costPerClick: number;
  targetCountries: string[];
  targetCategories: Category[];
}): Promise<Campaign> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw new Error("Campaign name must be 2–120 characters");
  if (!(input.budget > 0)) throw new Error("Budget must be greater than zero");
  if (input.costPerView < 0 || input.costPerClick < 0) throw new Error("Costs cannot be negative");
  if (input.destinationUrl && !/^https?:\/\//i.test(input.destinationUrl.trim())) {
    throw new Error("Destination URL must start with http:// or https://");
  }

  const { data, error } = await supabase
    .from("ad_campaigns")
    .insert({
      advertiser_id: input.advertiserId,
      name,
      headline: input.headline?.trim() || null,
      description: input.description?.trim() || null,
      destination_url: input.destinationUrl?.trim() || null,
      budget: input.budget,
      cost_per_view: input.costPerView,
      cost_per_click: input.costPerClick,
      target_countries: input.targetCountries,
      target_categories: input.targetCategories,
      status: "pending_review",
    })
    .select(CAMPAIGN_SELECT)
    .single();
  if (error) throw error;
  return toCampaign(data as Record<string, unknown>);
}

export async function setCampaignPaused(campaignId: string, paused: boolean) {
  const { error } = await supabase
    .from("ad_campaigns")
    .update({ status: paused ? "paused" : "active" })
    .eq("id", campaignId);
  if (error) throw error;
}

export type CampaignAnalytics = {
  impressions: number;
  clicks: number;
  spent: number;
  ctr: number;
  reach: number;
};

export async function fetchCampaignAnalytics(campaignIds: string[]) {
  const map = new Map<string, CampaignAnalytics>();
  if (campaignIds.length === 0) return map;
  const { data, error } = await supabase
    .from("ad_events")
    .select("campaign_id,event_type,cost,viewer_id")
    .in("campaign_id", campaignIds);
  if (error) throw error;

  const reach = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const current = map.get(row.campaign_id) ?? { impressions: 0, clicks: 0, spent: 0, ctr: 0, reach: 0 };
    if (row.event_type === "click") current.clicks += 1;
    else current.impressions += 1;
    current.spent += Number(row.cost ?? 0);
    map.set(row.campaign_id, current);

    const set = reach.get(row.campaign_id) ?? new Set<string>();
    if (row.viewer_id) set.add(row.viewer_id);
    reach.set(row.campaign_id, set);
  }
  for (const [id, value] of map) {
    value.ctr = value.impressions > 0 ? (value.clicks / value.impressions) * 100 : 0;
    value.reach = reach.get(id)?.size ?? 0;
  }
  return map;
}

export async function recordAdEvent(campaignId: string, eventType: "impression" | "click") {
  const { error } = await supabase.rpc("record_ad_event", {
    _campaign_id: campaignId,
    _event_type: eventType,
  });
  if (error) throw error;
}
