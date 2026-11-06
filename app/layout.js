import "./globals.css";
import QueryProvider from "./components/QueryProvider";

export const metadata = {
  title: "ReelLearn AI — Educational Video Pipeline",
  description: "AI-powered multilingual educational video generation and review pipeline.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
