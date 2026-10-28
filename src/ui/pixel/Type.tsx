// Typographic presets so every screen speaks the same pixel language.

import { PixelText, type PixelTextProps, usePx } from './PixelText';

type P = Omit<PixelTextProps, 'text'> & { children: string | number };

/** World names, big screen titles. */
export const WorldTitle = ({ children, ...p }: P) => <PixelText text={children} font="gothic" size={20} tone="gold" align="center" wrap as="h1" {...p} />;

/** Section and modal headings: chunky pixel caps with a dithered ramp. */
export function Heading({ children, ...p }: P) {
  const px = usePx();
  return <PixelText text={String(children).toUpperCase()} font="pixel" size={8} tone="gold" as="h2" scale={px + 1} chroma={false} {...p} />;
}

/** Card and offering names. */
export const CardName = ({ children, ...p }: P) => <PixelText text={children} font="gothic" size={16} tone="bone" align="center" wrap scale={2} {...p} />;

/** Big numbers: scores, clocks. */
export const Num = ({ children, ...p }: P) => <PixelText text={children} font="gothic" size={22} tone="bone" scale={2} chroma={false} {...p} />;
