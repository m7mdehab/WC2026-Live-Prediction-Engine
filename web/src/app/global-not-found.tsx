import Link from "next/link";
import "./globals.css";
import { FONT_VARIABLES } from "@/lib/fonts";

// THE GLOBAL 404 (Wave 16, repairing collateral of the chrome seam).
//
// WHY THIS FILE HAD TO EXIST. Splitting the app into two sibling root layouts left unmatched URLs
// with NO root layout above them: Next resolves a hard 404 above both route groups. Two independent
// adversarial reviewers found the same consequence, and it was worse than it looks. Before, the
// built-in 404 rendered inside the single root layout, so it came out as a fully branded, themed,
// lang="en" page with the site header and footer. After the split it came out as an unstyled system
// page with no data-theme, no chrome, no fonts and no lang attribute.
//
// AND IT IS ON THE LIVE PATH TODAY. While the second surface is dark, web/src/middleware.ts rewrites
// every request under its matcher to a path that cannot exist, so the app's not-found page answers
// with a real 404. That means EVERY dark-gated request currently renders this page. It was the least
// visible page in the app and it turned out to be one of the most requested.
//
// This is a shared, root-level file, sibling to globals.css, robots.ts and sitemap.ts, not a World
// Cup page. It restores what the single root layout used to provide: lang, the font variables, the
// pre-paint theme resolution, and a themed surface with a way back into the site.
//
// The pre-paint script is the WORLD CUP one, byte for byte, and that is deliberate. A 404 belongs to
// no surface, so it takes the site-wide default (light), exactly as it did before the split. Copying
// it rather than importing keeps this file from depending on a layout it is not rendered by, and
// web/test/wc_chrome_parity.mjs asserts the two stay identical.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'&&t!=='midnight'){t='light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export const metadata = {
  title: "Page not found",
  description: "That page does not exist.",
};

export default function GlobalNotFound() {
  return (
    <html lang="en" suppressHydrationWarning className={`${FONT_VARIABLES} h-full`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <div className="flex min-h-screen flex-col overflow-x-clip bg-bg">
          <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col items-center justify-center px-4 py-24 text-center md:px-6">
            <p className="font-display text-5xl font-bold text-fg">404</p>
            <p className="mt-3 text-sm text-secondary">That page does not exist.</p>
            <p className="mt-8 text-sm">
              <Link href="/" className="text-confident underline-offset-2 hover:underline">
                Back to the forecast
              </Link>
            </p>
          </main>
        </div>
      </body>
    </html>
  );
}
