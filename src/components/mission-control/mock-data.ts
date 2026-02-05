export type Agent = {
  id: string;
  name: string;
  role: string;
  level: "LEAD" | "SPC" | "INT";
  status: "WORKING" | "IDLE" | "BLOCKED";
};

export type Task = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  assignees?: { name: string; color?: "gray" | "amber" | "green" | "blue" }[];
  updatedAgo: string;
};

export const agents: Agent[] = [
  { id: "bhanu", name: "Bhanu", role: "Founder", level: "LEAD", status: "WORKING" },
  { id: "friday", name: "Friday", role: "Developer Agent", level: "INT", status: "WORKING" },
  { id: "fury", name: "Fury", role: "Customer Research", level: "SPC", status: "WORKING" },
  { id: "jarvis", name: "Jarvis", role: "Squad Lead", level: "LEAD", status: "WORKING" },
  { id: "loki", name: "Loki", role: "Content Writer", level: "SPC", status: "WORKING" },
  { id: "pepper", name: "Pepper", role: "Email Marketing", level: "INT", status: "WORKING" },
  { id: "quill", name: "Quill", role: "Social Media", level: "INT", status: "WORKING" },
  { id: "shuri", name: "Shuri", role: "Product Analyst", level: "SPC", status: "WORKING" },
  { id: "vision", name: "Vision", role: "SEO Analyst", level: "SPC", status: "WORKING" },
  { id: "wanda", name: "Wanda", role: "Designer", level: "SPC", status: "WORKING" },
  { id: "wong", name: "Wong", role: "Documentation", level: "SPC", status: "WORKING" },
];

export const columns = [
  {
    key: "inbox",
    title: "Inbox",
    count: 11,
    tasks: [
      {
        id: "t1",
        title: "Explore SiteGPT Dashboard & Document All Features",
        description: "Thoroughly explore the entire SiteGPT dashboard…",
        tags: ["sitGPT", "documentation"],
        updatedAgo: "1 day ago",
      },
      {
        id: "t2",
        title: "Conduct Pricing Audit Using Rob Walling Framework",
        description: "Review SiteGPT pricing against Rob Walling’s principle…",
        tags: ["pricing", "audit"],
        updatedAgo: "about 3 hours ago",
      },
      {
        id: "t3",
        title: "Design Expansion Revenue Mechanics (SaaS Cheat Code)",
        description: "Implement Rob Walling’s…",
        tags: ["expansion", "revenue"],
        updatedAgo: "about 3 hours ago",
      },
      {
        id: "t4",
        title: "Implement Dual Funnel Strategy for SMB + Enterprise",
        description: "Apply Rob Walling’s dual funnel SaaS cheat code…",
        tags: ["smb", "enterprise"],
        updatedAgo: "about 3 hours ago",
      },
    ] as Task[],
  },
  {
    key: "assigned",
    title: "Assigned",
    count: 10,
    tasks: [
      {
        id: "a1",
        title: "Product Demo Video Script",
        description: "Create full script for SiteGPT product demo video…",
        tags: ["video", "content", "demo"],
        assignees: [{ name: "Loki" }],
        updatedAgo: "1 day ago",
      },
      {
        id: "a2",
        title: "Tweet Content - Real Stories Only",
        description: "Create authentic tweets based on real SiteGPT customer data…",
        tags: ["social", "twitter", "content"],
        assignees: [{ name: "Quill" }],
        updatedAgo: "about 8 hours ago",
      },
      {
        id: "a3",
        title: "Customer Research - Tweet Material",
        description: "Pull real customer data and stories from Slack for tweet…",
        tags: ["research", "customer-insights"],
        assignees: [{ name: "Fury" }],
        updatedAgo: "about 8 hours ago",
      },
    ] as Task[],
  },
  {
    key: "in_progress",
    title: "In Progress",
    count: 7,
    tasks: [
      {
        id: "p1",
        title: "SiteGPT vs Zendesk AI Comparison",
        description: "Create detailed brief for Zendesk AI comparison page…",
        tags: ["comparison", "seo"],
        assignees: [{ name: "Loki" }, { name: "Vision" }],
        updatedAgo: "1 day ago",
      },
      {
        id: "p2",
        title: "SiteGPT vs Intercom Fin Comparison",
        description: "Create detailed brief for intercom fin comparison page…",
        tags: ["comparison"],
        assignees: [{ name: "Vision" }],
        updatedAgo: "2 days ago",
      },
      {
        id: "p3",
        title: "Mine Slybill Call Recordings For Customer Insights",
        description: "Read through #sybill notifications in Slack…",
        tags: ["calls", "insights"],
        assignees: [{ name: "Fury" }],
        updatedAgo: "about 8 hours ago",
      },
    ] as Task[],
  },
  {
    key: "review",
    title: "Review",
    count: 5,
    tasks: [
      {
        id: "r1",
        title: "Shopify Blog Landing Page",
        description: "Write copy for Shopify integration landing page…",
        tags: ["copy", "landing-page"],
        assignees: [{ name: "Loki" }],
        updatedAgo: "1 day ago",
      },
      {
        id: "r2",
        title: "Best AI Chatbot for Shopify - Full Blog Post",
        description: "Write full SEO blog post: Best AI chatbot for Shopify in 2026…",
        tags: ["blog", "seo", "shopify"],
        assignees: [{ name: "Loki" }],
        updatedAgo: "1 day ago",
      },
      {
        id: "r3",
        title: "Mission Control UI",
        description: "Build real-time agent command center with React + Convex",
        tags: ["internal", "tooling", "ui"],
        assignees: [{ name: "Jarvis" }],
        updatedAgo: "1 day ago",
      },
      {
        id: "r4",
        title: "Email Marketing Strategy: Userlist Inspired Lifecycle Campaigns",
        description: "Comprehensive email marketing strategy based on Userlist’s SaaS…",
        tags: ["email-marketing", "lifecycle"],
        assignees: [{ name: "Pepper" }],
        updatedAgo: "about 15 hours ago",
      },
    ] as Task[],
  },
  {
    key: "done",
    title: "Done",
    count: 0,
    tasks: [] as Task[],
  },
] as const;

export const liveFeed = [
  {
    id: "lf1",
    who: "Quill",
    action: "commented on",
    what: '"Write Customer Case Studies (Brent + Will)"',
    when: "about 2 hours ago",
  },
  {
    id: "lf2",
    who: "Quill",
    action: "commented on",
    what: '"Twitter Content Blitz - 10 Tweets This Week"',
    when: "about 2 hours ago",
  },
  {
    id: "lf3",
    who: "Friday",
    action: "commented on",
    what: '"Design Expansion Revenue Mechanics (SaaS Cheat Code)"',
    when: "about 2 hours ago",
  },
  {
    id: "lf4",
    who: "Pepper",
    action: "commented on",
    what: '"Design Expansion Revenue Mechanics (SaaS Cheat Code)"',
    when: "about 2 hours ago",
  },
];
