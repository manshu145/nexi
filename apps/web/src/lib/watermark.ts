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

const LOGO_SVG_URL = '/brand/nexigrate-logo-light.svg';
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
