import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SecureDevOps — GitHub Dependency Vulnerability Scanner',
  description:
    'Automated Software Composition Analysis (SCA) tool for Node.js dependencies using the OSV database.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0B0F17] text-gray-100 antialiased selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
