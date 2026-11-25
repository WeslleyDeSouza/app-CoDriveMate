import { MapIcon } from '../domain/ports';

export const ARROW_PX = 88;

/** Draws the position arrow (pointing north) at double resolution. */
function drawArrow(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ARROW_PX;
  const c = canvas.getContext('2d');
  if (!c) return canvas;
  c.scale(2, 2);
  const disc = (radius: number, fill: string) => {
    c.beginPath();
    c.arc(22, 22, radius, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
  };
  disc(20, 'rgba(76,141,255,.18)');
  disc(14, '#fff');
  c.beginPath();
  c.moveTo(22, 10);
  c.lineTo(31, 31);
  c.lineTo(22, 26);
  c.lineTo(13, 31);
  c.closePath();
  c.fillStyle = '#2f6fea';
  c.fill();
  return canvas;
}

const SIGNS = {
  parking: { letter: 'P', color: '#2f6fea' },
  fuel: { letter: 'T', color: '#1a9c5a' },
  warning: { letter: '!', color: '#d97706' },
};

/** Square sign for a place. */
function drawSign({ letter, color }: { letter: string; color: string }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ARROW_PX;
  const c = canvas.getContext('2d');
  if (!c) return canvas;
  const s = ARROW_PX;
  c.beginPath();
  c.roundRect(s * 0.08, s * 0.08, s * 0.84, s * 0.84, s * 0.2);
  c.fillStyle = color;
  c.fill();
  c.lineWidth = s * 0.06;
  c.strokeStyle = '#fff';
  c.stroke();
  c.fillStyle = '#fff';
  c.font = `700 ${s * 0.6}px sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(letter, s / 2, s * 0.53);
  return canvas;
}

export function drawIcon(icon: MapIcon): HTMLCanvasElement {
  return icon === 'arrow' ? drawArrow() : drawSign(SIGNS[icon]);
}
