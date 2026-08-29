export type AuditSeverity = "high" | "medium" | "low";
export type AuditCategory = "Usability" | "Responsive layout" | "Accessibility" | "Links" | "Interactions";

export type AuditIssue = {
  id: string;
  severity: AuditSeverity;
  category: AuditCategory;
  title: string;
  detail: string;
  recommendation: string;
};

export type LinkCheck = {
  url: string;
  ok: boolean;
  status?: number;
};

export type WebsiteAuditReport = {
  url: string;
  scannedAt: string;
  responseTimeMs: number;
  status: number;
  score: number;
  summary: string;
  issues: AuditIssue[];
  checks: Array<{ category: AuditCategory; label: string; status: "pass" | "review" | "issue" }>;
  links: { total: number; checked: number; broken: number };
  renderedReview?: { status: "complete" | "unavailable"; notes: string };
};

const severityPenalty: Record<AuditSeverity, number> = { high: 16, medium: 8, low: 3 };

function countMatches(html: string, pattern: RegExp) {
  return (html.match(pattern) || []).length;
}

function addIssue(issues: AuditIssue[], issue: Omit<AuditIssue, "id">) {
  issues.push({ ...issue, id: `${issue.category.toLowerCase().replace(/\s+/g, "-")}-${issues.length + 1}` });
}

function attributeValue(tag: string, name: string) {
  const expression = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i");
  return tag.match(expression)?.[1]?.trim() || "";
}

export function extractAuditableLinks(html: string, baseUrl: string, maxLinks = 10) {
  const links = new Set<string>();
  const anchorPattern = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const base = new URL(baseUrl);
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) && links.size < maxLinks) {
    const rawHref = match[1]?.trim();
    if (!rawHref || rawHref.startsWith("#") || /^(mailto:|tel:|javascript:|data:)/i.test(rawHref)) continue;
    try {
      const target = new URL(rawHref, base);
      if (target.protocol !== "http:" && target.protocol !== "https:") continue;
      if (target.origin !== base.origin) continue;
      target.hash = "";
      links.add(target.toString());
    } catch {
      // Invalid links are reported by the page-level audit below.
    }
  }

  return [...links];
}

export function auditWebsiteHtml({
  url,
  html,
  status,
  responseTimeMs,
  linkChecks = [],
}: {
  url: string;
  html: string;
  status: number;
  responseTimeMs: number;
  linkChecks?: LinkCheck[];
}): WebsiteAuditReport {
  const issues: AuditIssue[] = [];
  const h1Count = countMatches(html, /<h1\b[^>]*>/gi);
  const images = html.match(/<img\b[^>]*>/gi) || [];
  const imagesWithoutAlt = images.filter((tag) => !/\balt\s*=\s*["'][^"']*["']/i.test(tag)).length;
  const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/gi) || [];
  const unnamedButtons = buttons.filter((button) => {
    const text = button.replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").trim();
    return !text && !attributeValue(button, "aria-label") && !attributeValue(button, "title");
  }).length;
  const anchorTags = html.match(/<a\b[^>]*>/gi) || [];
  const unsafeAnchorCount = anchorTags.filter((tag) => {
    const href = attributeValue(tag, "href");
    return !href || href === "#" || /^javascript:/i.test(href);
  }).length;
  const hasViewport = /<meta\b[^>]*\bname\s*=\s*["']viewport["'][^>]*>/i.test(html);
  const htmlLang = /<html\b[^>]*\blang\s*=\s*["'][^"']+["'][^>]*>/i.test(html);
  const hasMainLandmark = /<main\b/i.test(html);
  const formFields = html.match(/<(?:input|select|textarea)\b[^>]*>/gi) || [];
  const labelledFields = formFields.filter((field) => attributeValue(field, "aria-label") || attributeValue(field, "aria-labelledby") || attributeValue(field, "id")).length;
  const formLabelCoverage = formFields.length === 0 || labelledFields === formFields.length;

  if (status < 200 || status >= 400) {
    addIssue(issues, {
      severity: "high",
      category: "Usability",
      title: `The page returned HTTP ${status}`,
      detail: "Visitors may be unable to load the submitted page reliably.",
      recommendation: "Resolve the server or deployment response before making interface changes.",
    });
  }
  if (!hasViewport) {
    addIssue(issues, {
      severity: "high",
      category: "Responsive layout",
      title: "The viewport meta tag is missing",
      detail: "Mobile browsers may render the page at a desktop-scale layout.",
      recommendation: "Add a viewport tag with width=device-width and initial-scale=1.",
    });
  }
  if (h1Count !== 1) {
    addIssue(issues, {
      severity: "medium",
      category: "Accessibility",
      title: h1Count === 0 ? "No primary page heading was found" : "Multiple primary page headings were found",
      detail: "A clear, single H1 helps visitors and assistive technologies understand the page purpose.",
      recommendation: "Use one descriptive H1 for the main page purpose and reserve lower heading levels for sections.",
    });
  }
  if (!htmlLang) {
    addIssue(issues, {
      severity: "medium",
      category: "Accessibility",
      title: "The document language is not declared",
      detail: "Screen readers cannot reliably select the correct pronunciation rules.",
      recommendation: "Set a valid lang attribute on the root html element.",
    });
  }
  if (!hasMainLandmark) {
    addIssue(issues, {
      severity: "low",
      category: "Accessibility",
      title: "No main landmark was detected",
      detail: "Keyboard and screen-reader users may have a less efficient route to page content.",
      recommendation: "Wrap the primary page content in a main landmark.",
    });
  }
  if (imagesWithoutAlt > 0) {
    addIssue(issues, {
      severity: "medium",
      category: "Accessibility",
      title: `${imagesWithoutAlt} image${imagesWithoutAlt === 1 ? "" : "s"} lack alternative text`,
      detail: "Meaningful images without alt text are unavailable to visitors using assistive technologies.",
      recommendation: "Add concise alt text for meaningful imagery and alt=\"\" for decorative images.",
    });
  }
  if (!formLabelCoverage) {
    addIssue(issues, {
      severity: "medium",
      category: "Accessibility",
      title: "Some form fields may not have an accessible name",
      detail: "Inputs should expose a label through a label element, aria-label, or aria-labelledby.",
      recommendation: "Associate every form control with a visible label or an equivalent accessible name.",
    });
  }
  if (unnamedButtons > 0) {
    addIssue(issues, {
      severity: "medium",
      category: "Interactions",
      title: `${unnamedButtons} button${unnamedButtons === 1 ? "" : "s"} may not have an accessible name`,
      detail: "Icon-only controls need a programmatic label so their purpose remains clear.",
      recommendation: "Add visible text, aria-label, or aria-labelledby to each unlabeled button.",
    });
  }
  if (unsafeAnchorCount > 0) {
    addIssue(issues, {
      severity: "medium",
      category: "Links",
      title: `${unsafeAnchorCount} placeholder or script link${unsafeAnchorCount === 1 ? " was" : "s were"} found`,
      detail: "Placeholder and javascript: links can create dead ends or inconsistent keyboard behavior.",
      recommendation: "Use a semantic button for in-page actions and a valid destination for navigation links.",
    });
  }
  const brokenLinks = linkChecks.filter((check) => !check.ok);
  if (brokenLinks.length > 0) {
    addIssue(issues, {
      severity: "high",
      category: "Links",
      title: `${brokenLinks.length} checked internal link${brokenLinks.length === 1 ? " did" : "s did"} not resolve`,
      detail: brokenLinks.slice(0, 3).map((check) => check.status ? `${check.url} (HTTP ${check.status})` : check.url).join("; "),
      recommendation: "Repair, redirect, or remove the affected destinations before publishing changes.",
    });
  }
  if (responseTimeMs > 3000) {
    addIssue(issues, {
      severity: "low",
      category: "Usability",
      title: "The initial document response was slow",
      detail: `The page document took ${Math.round(responseTimeMs)} ms to return in this audit.` ,
      recommendation: "Review server response time, critical dependencies, and large blocking assets.",
    });
  }

  const score = Math.max(0, 100 - issues.reduce((total, issue) => total + severityPenalty[issue.severity], 0));
  const checks: WebsiteAuditReport["checks"] = [
    { category: "Usability", label: `Document returned HTTP ${status} in ${Math.round(responseTimeMs)} ms`, status: status >= 200 && status < 400 ? "pass" : "issue" },
    { category: "Responsive layout", label: hasViewport ? "Viewport metadata detected" : "Viewport metadata requires review", status: hasViewport ? "pass" : "issue" },
    { category: "Accessibility", label: htmlLang && h1Count === 1 && imagesWithoutAlt === 0 && formLabelCoverage ? "Core structural checks passed" : "Structural accessibility needs review", status: htmlLang && h1Count === 1 && imagesWithoutAlt === 0 && formLabelCoverage ? "pass" : "review" },
    { category: "Links", label: linkChecks.length ? `${linkChecks.length} internal destinations checked` : "No internal destinations eligible for a safe automated check", status: brokenLinks.length ? "issue" : linkChecks.length ? "pass" : "review" },
    { category: "Interactions", label: unnamedButtons ? "Interactive control names require review" : "Button labels passed the static check", status: unnamedButtons ? "review" : "pass" },
  ];

  return {
    url,
    scannedAt: new Date().toISOString(),
    responseTimeMs,
    status,
    score,
    summary: issues.length ? `${issues.length} issue${issues.length === 1 ? "" : "s"} found across the automated baseline checks.` : "No automated baseline issues were detected. Perform a visual and task-based review before publishing.",
    issues,
    checks,
    links: { total: anchorTags.length, checked: linkChecks.length, broken: brokenLinks.length },
  };
}
