import { createFileRoute, redirect } from "@tanstack/react-router";
import Home from "@/components/home/Home";
import { ensureAuthReady, homeForRole } from "@/lib/auth";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const snap = await ensureAuthReady();
    if (snap.status === "signedIn") {
      throw redirect({ to: homeForRole(snap.role) });
    }
  },
  head: () => ({
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "EducationalOrganization",
          name: "CL Aspire",
          description:
            "CL Aspire is Bangladesh's premium platform for ICAB CA students — chapter-wise MCQ practice, mock examinations, question bank and performance analytics for Certificate, Professional and Advanced Level candidates.",
          url: "https://claspire.com/",
          areaServed: "Bangladesh",
          sameAs: [
            "https://twitter.com/claspire",
            "https://www.linkedin.com/company/claspire",
            "https://www.youtube.com/@claspire",
          ],
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "4.9",
            reviewCount: "1240",
          },
        }),
      },
    ],
  }),
  component: Home,
});
