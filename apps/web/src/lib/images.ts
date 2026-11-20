import day from "@/assets/proof-day.jpg";
import night from "@/assets/proof-night.jpg";
import led from "@/assets/media-led.jpg";
import tower from "@/assets/site-bandra-tower.jpg";
export const SITE_IMG = { day, night, led, tower } as const;
export function proofSrc(img: string) {
  if (img.startsWith("seed:")) return SITE_IMG[img.slice(5) as keyof typeof SITE_IMG];
  return img;
}
