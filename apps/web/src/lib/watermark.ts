/**
 * PR-47: Add Nexigrate watermark to generated images before saving.
 *
 * Draws the brand logo (SVG) as a semi-transparent overlay in the
 * bottom-right corner of the image. Runs entirely client-side on a
 * canvas — no server round-trip needed.
 *
 * Input: base64 data URL (data:image/png;base64,...)
 * Output: base64 data URL with watermark applied
 */

const LOGO_SVG_URL = '/brand/nexigrate-logo-dark.svg';
const WATERMARK_OPACITY = 0.5;
const WATERMARK_SCALE = 0.18; // 18% of image width

export async function addWatermark(dataUrl: string): Promise<string> {
  if (typeof document === 'undefined') return dataUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Load and draw watermark logo
      const logo = new Image();
      logo.crossOrigin = 'anonymous';
      logo.onload = () => {
        const logoWidth = img.width * WATERMARK_SCALE;
        const logoHeight = logoWidth / 4; // logo aspect ratio is 4:1
        const x = img.width - logoWidth - 16;
        const y = img.height - logoHeight - 24;

        ctx.globalAlpha = WATERMARK_OPACITY;
        ctx.drawImage(logo, x, y, logoWidth, logoHeight);
        ctx.globalAlpha = 1;

        // Add "Nexigrate" text below logo as reinforcement
        const fontSize = Math.max(11, img.width * 0.022);
        ctx.font = `600 ${fontSize}px -apple-system, sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.textAlign = 'right';
        ctx.fillText('Nexigrate', img.width - 16, img.height - 10);

        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      logo.onerror = () => {
        // If logo fails to load, add "Nexigrate" text watermark as fallback
        const fontSize = Math.max(14, img.width * 0.03);
        ctx.font = `bold ${fontSize}px -apple-system, sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.textAlign = 'right';
        ctx.fillText('Nexigrate', img.width - 16, img.height - 16);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      logo.src = LOGO_SVG_URL;
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}


/**
 * Watermark for SAVED CHAPTER PAGES (light "paper" background).
 *
 * The addWatermark() above uses light/white text tuned for dark visualization
 * images — invisible on the cream reader page. This variant uses the brand
 * deep-red, visible on light backgrounds:
 *   - bottom-right "nexigrate.com" (semi-transparent)
 *   - a large faint diagonal "Nexigrate" across the centre (deters cropping)
 *
 * Input/Output: base64 data URL. Returns a JPEG data URL.
 */
export async function addPageWatermark(dataUrl: string): Promise<string> {
  if (typeof document === 'undefined') return dataUrl;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0);

      // Diagonal faint brand mark across the centre.
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-Math.PI / 6);
      ctx.font = `bold ${Math.max(40, img.width * 0.12)}px Georgia, serif`;
      ctx.fillStyle = 'rgba(139, 26, 14, 0.06)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Nexigrate', 0, 0);
      ctx.restore();

      // Bottom-right site tag.
      const fontSize = Math.max(13, img.width * 0.022);
      ctx.font = `600 ${fontSize}px Georgia, serif`;
      ctx.fillStyle = 'rgba(139, 26, 14, 0.45)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('nexigrate.com', img.width - 16, img.height - 14);

      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
