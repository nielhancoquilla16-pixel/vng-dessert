import { BarcodeFormat, EncodeHintType, QRCodeWriter } from '@zxing/library';

const QR_CHARACTER_SET = 'UTF-8';
const DEFAULT_QR_SIZE = 220;
const writer = new QRCodeWriter();

export const generateQrDataUrl = (value = '', size = DEFAULT_QR_SIZE) => {
  const payload = String(value || '').trim();

  if (!payload || typeof document === 'undefined') {
    return '';
  }

  const dimension = Math.max(96, Number(size) || DEFAULT_QR_SIZE);
  const hints = new Map();
  hints.set(EncodeHintType.MARGIN, 1);
  hints.set(EncodeHintType.CHARACTER_SET, QR_CHARACTER_SET);

  const matrix = writer.encode(payload, BarcodeFormat.QR_CODE, dimension, dimension, hints);
  const width = matrix.getWidth();
  const height = matrix.getHeight();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    return '';
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#0f172a';

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (matrix.get(x, y)) {
        context.fillRect(x, y, 1, 1);
      }
    }
  }

  return canvas.toDataURL('image/png');
};
