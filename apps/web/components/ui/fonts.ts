/**
 * Centralized next/font loaders. Import { displayFont, monoFont } from
 * here rather than re-declaring the loader in every file — each call
 * generates a distinct font instance + CSS payload.
 */
import { Antonio, JetBrains_Mono } from 'next/font/google';

export const displayFont = Antonio({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  display: 'swap',
  variable: '--font-display-next',
});

export const monoFont = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-mono-next',
});
