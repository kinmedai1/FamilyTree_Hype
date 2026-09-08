"use strict";

const CANVAS_SIZE = 1024;
const FACE_ASSET_ROOT = "face-assets";

const HEADS = [
  "あまつゆ", "イカ", "いぬみみ", "うさみみ", "おおはね", "おかっぱ", "おさかな", "おだんご", "おにぎり", "おんがくか",
  "かえる", "かどまる", "キャッスル", "キャンディ", "くま", "クワガタ", "こぐま", "コック", "さんかく", "しかく",
  "しずく", "しょくパン", "シルクハット", "スター", "スポーティ", "だいてんしゅ", "ダイヤ", "たいよう", "たてまる", "たまご",
  "たまねぎ", "タワー", "チューリップ", "つぼ", "でこ", "デビル", "てんしゅ", "でんち", "トゲトゲ", "とんがり",
  "ねこみみ", "ハート", "はね", "ピエロ", "ひかり", "ひつじ", "ヒレ", "ブロック", "ぼこ", "まきがい",
  "まめ", "まる", "みかづき", "メラメラ", "よこまる", "りゅうせい", "ルビー", "ロケット", "ロボ", "わっか"
];

// 自動検出したアンテナ位置への頭別補正値（完成画像上のpx）。
// x: 正数で右／負数で左、y: 正数で下／負数で上。
// 記載のない頭は { x: 0, y: 0 } として扱います。
const HEAD_ANTENNA_OFFSETS = {
  "しずく": { x: 10, y: -35 },
  "ダイヤ": { x: 10, y: -35 },
  "たいよう": { x: 10, y: 65 },
  "トゲトゲ": { x: 10, y: -35 },
  "ひかり": { x: 10, y: 95 }
};

const ANTENNAS = [
  "あられ", "アンテナなし", "いしつぶて", "いなづま", "おどかす", "かいほうする", "かがやくれいき", "かさいせんぷう", "かまいたち", "かみなりふぶき",
  "げどく", "こおりあらし", "こおりいんせき", "しびれとる", "じゃあくなかぜ", "じゃあくなほのお", "じゃあくのじわれ", "すこしあやつる", "すこしアンテナふうじ", "すこしおそくなれ",
  "すこしかたくなれ", "すこしかわしやすい", "すこしこうふん", "すこししびれさせる", "すこしつよくなれ", "すこしねむらせる", "すこしはやくなれ", "すこしひっちゅう", "すこしブレスふうじ", "すこしむてき",
  "すこしめかくし", "すこしやわくなれ", "すこしよけにくい", "すこしよわくなれ", "スポットライト", "せいでんき", "ぜんぶなおす", "ぞくせいなおす", "ダークシャワー", "ダークボール",
  "だいちのひかり", "だいふんか", "たかなみ", "たくわえる", "ちいさくトゲトゲ", "ちょっとあしもとガード", "ちょっとかいふく", "ちょっとステルス", "ちょっとふっかつ", "つちけむり",
  "つむじかぜ", "でんきあらし", "でんこう", "とがったこおり", "ならくのたいよう", "ノックダウン", "バケツのみず", "ひかりたつまき", "ひかりのあめ", "ひさめ",
  "ひのたま", "ひゃくボルト", "ふゆのひざし", "ぼうふうう", "ほのおのうみ", "みずでっぽう", "みんなあてられにくい", "みんなおそめになれ", "みんなかためになれ", "みんなすこしあやつる",
  "みんなすこしアンテナふうじ", "みんなすこしこうふん", "みんなすこししびれさせる", "みんなすこしねむらせる", "みんなすこしひっちゅう", "みんなすこしブレスふうじ", "みんなすこしむてき", "みんなすこしめかくし", "みんなすこしよけにくい", "みんなちいさくトゲトゲ",
  "みんなちょっとかいふく", "みんなちょっとふっかつ", "みんなつよめになれ", "みんなどくになれ", "みんなノックダウン", "みんなはやめになれ", "みんなむてきかいじょ", "みんなよわめになれ", "みんなわざはねかえす1", "むてきかいじょ",
  "めざめる", "もえさかるこおり", "もえるひかりのや", "やまかじ", "やみのいかづち", "よわいこうせん", "らいう", "らくせき", "らくらいかさい", "ロックアイス", "わざはねかえす1"
];

const PATTERNS = [
  "アニマル", "うろこ", "ギンガムチェック", "シェブロン", "しずく", "ストライプ", "スプラッシュ", "スペード",
  "ダイヤ", "ツートン", "トラ", "なし", "バブルドット", "ピンドット", "ヘビ", "ボーダー", "マーブル", "レンガ",
  "花", "斜めボーダー", "水玉", "星", "鱗文"
];

const BODY_COLORS = [
  "黄", "金", "銀", "黒", "紫", "水", "青", "赤", "桃", "濃黄", "濃金", "濃銀", "濃黒", "濃紫", "濃水", "濃青", "濃赤", "濃桃",
  "濃白", "濃緑", "濃橙", "白", "薄黄", "薄金", "薄銀", "薄黒", "薄紫", "薄水", "薄青", "薄赤", "薄桃", "薄白", "薄緑", "薄橙", "緑", "橙"
];

const INITIAL_STATE = Object.freeze({
  head: "よこまる",
  antenna: "すこしつよくなれ",
  pattern: "アニマル",
  bodyColor1: "緑",
  bodyColor2: "赤",
  linkedFace: 43,
  skinColor: 2,
  hairColor: 6,
  eyebrow: 16,
  eye: 43,
  nose: 9,
  mouth: 20,
  cheek: 2,
  background: "#000000"
});

const assetPath = {
  head: value => `${FACE_ASSET_ROOT}/頭画像/${value}.png`,
  headReference: value => `${FACE_ASSET_ROOT}/頭画像/高画質頭画像/${value}.png`,
  antenna: value => `${FACE_ASSET_ROOT}/アンテナ画像/${value}.png`,
  pattern: value => `${FACE_ASSET_ROOT}/色・柄情報/柄画像/${value}.png`,
  bodyColor: value => `${FACE_ASSET_ROOT}/色・柄情報/体色画像/${value}.png`,
  linkedFace: value => `${FACE_ASSET_ROOT}/髪・輪郭画像/髪_輪郭対応画像/${value}.png`,
  face: value => `${FACE_ASSET_ROOT}/髪・輪郭画像/輪郭画像/${value}`,
  hair: value => `${FACE_ASSET_ROOT}/髪・輪郭画像/髪型画像/${value}`,
  skinColor: value => `${FACE_ASSET_ROOT}/色・柄情報/肌色画像/${value}.png`,
  hairColor: value => `${FACE_ASSET_ROOT}/色・柄情報/髪色画像/${value}.png`,
  eyebrow: value => `${FACE_ASSET_ROOT}/顔パーツ画像/眉画像/${value}.png`,
  eye: value => `${FACE_ASSET_ROOT}/顔パーツ画像/目画像/${value}.png`,
  nose: value => `${FACE_ASSET_ROOT}/顔パーツ画像/鼻画像/${value}.png`,
  mouth: value => `${FACE_ASSET_ROOT}/顔パーツ画像/口画像/${value}.png`,
  cheek: value => `${FACE_ASSET_ROOT}/顔パーツ画像/頬画像/${value}.png`
};

let state = { ...INITIAL_STATE };
let linkedFaceMap = [];
let renderTicket = 0;

const canvas = document.querySelector("#face-canvas");
const controls = document.querySelector("#controls");
const statusElement = document.querySelector("#render-status");
const loadingCover = document.querySelector("#loading-cover");
const imageCache = new Map();
const processedCache = new Map();
const colorCache = new Map();

function range(count) {
  return Array.from({ length: count }, (_, index) => index);
}

function loadImage(path) {
  if (imageCache.has(path)) return imageCache.get(path);

  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`画像を読み込めませんでした: ${path}`));
    image.src = path;
  });

  imageCache.set(path, promise);
  return promise;
}

function makeCanvas(width, height) {
  const result = document.createElement("canvas");
  result.width = width;
  result.height = height;
  return result;
}

function colorDistance(data, offset, reference) {
  const red = data[offset] - reference[0];
  const green = data[offset + 1] - reference[1];
  const blue = data[offset + 2] - reference[2];
  return Math.sqrt(red * red + green * green + blue * blue);
}

function removeConnectedBackground(image, tolerance = 28) {
  const source = makeCanvas(image.naturalWidth, image.naturalHeight);
  const context = source.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);

  const imageData = context.getImageData(0, 0, source.width, source.height);
  const data = imageData.data;
  const pixelCount = source.width * source.height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const reference = [data[0], data[1], data[2]];
  let queueStart = 0;
  let queueEnd = 0;

  const canRemove = pixelIndex => {
    const offset = pixelIndex * 4;
    return data[offset + 3] === 0 || colorDistance(data, offset, reference) <= tolerance;
  };

  const enqueue = pixelIndex => {
    if (visited[pixelIndex] || !canRemove(pixelIndex)) return;
    visited[pixelIndex] = 1;
    queue[queueEnd++] = pixelIndex;
  };

  for (let x = 0; x < source.width; x += 1) {
    enqueue(x);
    enqueue((source.height - 1) * source.width + x);
  }
  for (let y = 0; y < source.height; y += 1) {
    enqueue(y * source.width);
    enqueue(y * source.width + source.width - 1);
  }

  while (queueStart < queueEnd) {
    const pixelIndex = queue[queueStart++];
    const x = pixelIndex % source.width;
    const y = Math.floor(pixelIndex / source.width);
    if (x > 0) enqueue(pixelIndex - 1);
    if (x < source.width - 1) enqueue(pixelIndex + 1);
    if (y > 0) enqueue(pixelIndex - source.width);
    if (y < source.height - 1) enqueue(pixelIndex + source.width);
  }

  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    if (visited[pixelIndex]) data[offset + 3] = 0;
    if (data[offset + 3] > 8) {
      const x = pixelIndex % source.width;
      const y = Math.floor(pixelIndex / source.width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  context.putImageData(imageData, 0, 0);
  const bbox = maxX >= minX
    ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : { x: 0, y: 0, width: source.width, height: source.height };

  return { canvas: source, bbox };
}

async function processedImage(path, tolerance = 28) {
  const key = `${path}|${tolerance}`;
  if (processedCache.has(key)) return processedCache.get(key);
  const promise = loadImage(path).then(image => removeConnectedBackground(image, tolerance));
  processedCache.set(key, promise);
  return promise;
}

function removeHeadBackground(image) {
  const source = makeCanvas(image.naturalWidth, image.naturalHeight);
  const context = source.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);

  const imageData = context.getImageData(0, 0, source.width, source.height);
  const data = imageData.data;
  const cornerOffsets = [
    0,
    (source.width - 1) * 4,
    (source.height - 1) * source.width * 4,
    (source.height * source.width - 1) * 4
  ];
  const background = cornerOffsets.reduce((sum, offset) => ({
    r: sum.r + data[offset],
    g: sum.g + data[offset + 1],
    b: sum.b + data[offset + 2]
  }), { r: 0, g: 0, b: 0 });
  background.r /= cornerOffsets.length;
  background.g /= cornerOffsets.length;
  background.b /= cornerOffsets.length;

  const pixelCount = source.width * source.height;
  const distances = new Float32Array(pixelCount);
  let seedIndex = 0;
  let greatestDistance = -1;
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    const redDistance = data[offset] - background.r;
    const greenDistance = data[offset + 1] - background.g;
    const blueDistance = data[offset + 2] - background.b;
    const distance = Math.sqrt(redDistance ** 2 + greenDistance ** 2 + blueDistance ** 2);
    distances[pixelIndex] = distance;
    if (distance > greatestDistance) {
      greatestDistance = distance;
      seedIndex = pixelIndex;
    }
  }

  const foreground = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let queueStart = 0;
  let queueEnd = 0;
  const enqueue = pixelIndex => {
    if (pixelIndex < 0 || pixelIndex >= pixelCount || foreground[pixelIndex] || distances[pixelIndex] <= 5) return;
    foreground[pixelIndex] = 1;
    queue[queueEnd++] = pixelIndex;
  };
  enqueue(seedIndex);
  while (queueStart < queueEnd) {
    const pixelIndex = queue[queueStart++];
    const x = pixelIndex % source.width;
    if (x > 0) enqueue(pixelIndex - 1);
    if (x < source.width - 1) enqueue(pixelIndex + 1);
    if (pixelIndex >= source.width) enqueue(pixelIndex - source.width);
    if (pixelIndex < pixelCount - source.width) enqueue(pixelIndex + source.width);
  }

  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    const normalized = foreground[pixelIndex]
      ? Math.max(0, Math.min(1, (distances[pixelIndex] - 5) / 24))
      : 0;
    const smoothAlpha = normalized * normalized * (3 - 2 * normalized);
    data[offset + 3] = Math.round(data[offset + 3] * smoothAlpha);

    if (data[offset + 3] <= 8) continue;
    const x = pixelIndex % source.width;
    const y = Math.floor(pixelIndex / source.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  context.putImageData(imageData, 0, 0);
  const bbox = maxX >= minX
    ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : { x: 0, y: 0, width: source.width, height: source.height };
  return { canvas: source, bbox };
}

async function processedHeadImage(path) {
  const key = `${path}|head-background`;
  if (processedCache.has(key)) return processedCache.get(key);
  const promise = loadImage(path).then(removeHeadBackground);
  processedCache.set(key, promise);
  return promise;
}

function completeLightingMap(width, height, maskData, sourceLighting) {
  const pixelCount = width * height;
  let lighting = new Uint8ClampedArray(sourceLighting);
  const captured = new Uint8Array(pixelCount);
  const queued = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let queueStart = 0;
  let queueEnd = 0;

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    if (maskData[pixelIndex * 4 + 3] <= 8 || lighting[pixelIndex] === 0) continue;
    captured[pixelIndex] = 1;
    queued[pixelIndex] = 1;
    queue[queueEnd++] = pixelIndex;
  }

  const enqueue = (pixelIndex, light) => {
    if (pixelIndex < 0 || pixelIndex >= pixelCount || queued[pixelIndex]) return;
    if (maskData[pixelIndex * 4 + 3] <= 8) return;
    queued[pixelIndex] = 1;
    lighting[pixelIndex] = light;
    queue[queueEnd++] = pixelIndex;
  };

  while (queueStart < queueEnd) {
    const pixelIndex = queue[queueStart++];
    const x = pixelIndex % width;
    const light = lighting[pixelIndex];
    if (x > 0) enqueue(pixelIndex - 1, light);
    if (x < width - 1) enqueue(pixelIndex + 1, light);
    if (pixelIndex >= width) enqueue(pixelIndex - width, light);
    if (pixelIndex < pixelCount - width) enqueue(pixelIndex + width, light);
  }

  for (let pass = 0; pass < 12; pass += 1) {
    const smoothed = new Uint8ClampedArray(lighting);
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      if (captured[pixelIndex] || maskData[pixelIndex * 4 + 3] <= 8) continue;
      const x = pixelIndex % width;
      let sum = 0;
      let count = 0;
      if (x > 0 && lighting[pixelIndex - 1] > 0) { sum += lighting[pixelIndex - 1]; count += 1; }
      if (x < width - 1 && lighting[pixelIndex + 1] > 0) { sum += lighting[pixelIndex + 1]; count += 1; }
      if (pixelIndex >= width && lighting[pixelIndex - width] > 0) { sum += lighting[pixelIndex - width]; count += 1; }
      if (pixelIndex < pixelCount - width && lighting[pixelIndex + width] > 0) { sum += lighting[pixelIndex + width]; count += 1; }
      if (count > 0) smoothed[pixelIndex] = Math.round(sum / count);
    }
    lighting = smoothed;
  }

  return lighting;
}

function makeReferenceHeadMask(image) {
  const source = makeCanvas(image.naturalWidth, image.naturalHeight);
  const context = source.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, source.width, source.height);
  const data = imageData.data;

  const searchStart = Math.floor(source.height * 0.78);
  const searchEnd = Math.floor(source.height * 0.96);
  let seamY = searchStart;
  let seamMinX = 0;
  let seamMaxX = source.width - 1;
  let narrowestWidth = source.width + 1;

  for (let y = searchStart; y <= searchEnd; y += 1) {
    let minX = source.width;
    let maxX = -1;
    for (let x = 0; x < source.width; x += 1) {
      if (data[(y * source.width + x) * 4 + 3] <= 8) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
    const width = maxX >= minX ? maxX - minX + 1 : source.width + 1;
    if (width < narrowestWidth) {
      narrowestWidth = width;
      seamY = y;
      seamMinX = minX;
      seamMaxX = maxX;
    }
  }

  const centerX = (seamMinX + seamMaxX) / 2;
  const halfWidth = Math.max(1, (seamMaxX - seamMinX + 1) / 2);
  const capHeight = Math.max(10, Math.round(source.height * 0.018));

  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;
  let faceMinX = source.width;
  let faceMinY = source.height;
  let faceMaxX = -1;
  let faceMaxY = -1;
  const lightingMap = new Uint8ClampedArray(source.width * source.height);
  let lightingSum = 0;
  let lightingCount = 0;
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const offset = (y * source.width + x) * 4;
      const pixelIndex = y * source.width + x;
      const isFacePixel = data[offset + 3] > 8
        && data[offset] > 170
        && data[offset] > data[offset + 1] * 1.12
        && data[offset + 1] > data[offset + 2] * 1.02;
      if (isFacePixel) {
        faceMinX = Math.min(faceMinX, x);
        faceMinY = Math.min(faceMinY, y);
        faceMaxX = Math.max(faceMaxX, x);
        faceMaxY = Math.max(faceMaxY, y);
      }
      const isHeadColor = y < seamY
        && data[offset + 3] > 8
        && data[offset + 1] > data[offset] * 1.12
        && data[offset + 1] > data[offset + 2] * 1.12;
      if (isHeadColor) {
        const luminance = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
        lightingMap[pixelIndex] = Math.round(luminance);
        lightingSum += luminance;
        lightingCount += 1;
      }
      let alpha = data[offset + 3];
      if (y >= seamY) {
        const progress = (y - seamY) / capHeight;
        const rowHalfWidth = progress <= 1
          ? halfWidth * Math.sqrt(Math.max(0, 1 - progress * progress))
          : 0;
        const edgeDistance = rowHalfWidth - Math.abs(x - centerX);
        alpha = Math.min(alpha, Math.round(Math.max(0, Math.min(1, edgeDistance + 0.5)) * 255));
      }
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = alpha;
      if (alpha <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  context.putImageData(imageData, 0, 0);
  const detectedFaceBounds = faceMaxX >= faceMinX
    ? { x: faceMinX, y: faceMinY, width: faceMaxX - faceMinX + 1, height: faceMaxY - faceMinY + 1 }
    : null;
  const anchorCenterX = detectedFaceBounds
    ? detectedFaceBounds.x + detectedFaceBounds.width / 2
    : minX + (maxX - minX + 1) / 2;
  const anchorBand = Math.max(2, Math.round((maxX - minX + 1) * 0.025));
  const topSamples = [];
  for (let x = Math.round(anchorCenterX - anchorBand); x <= Math.round(anchorCenterX + anchorBand); x += 1) {
    for (let y = minY; y < seamY; y += 1) {
      if (data[(y * source.width + x) * 4 + 3] <= 8) continue;
      topSamples.push(y);
      break;
    }
  }
  topSamples.sort((a, b) => a - b);
  const antennaAnchorY = topSamples[Math.floor(topSamples.length / 2)] ?? minY;
  const completedLightingMap = completeLightingMap(source.width, source.height, data, lightingMap);

  return {
    canvas: source,
    bbox: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    faceBounds: detectedFaceBounds,
    antennaAnchor: { x: anchorCenterX, y: antennaAnchorY },
    lightingMap: completedLightingMap,
    lightingAverage: lightingCount > 0 ? lightingSum / lightingCount : 180
  };
}

async function processedReferenceHeadImage(path) {
  const key = `${path}|reference-head-mask`;
  if (processedCache.has(key)) return processedCache.get(key);
  const promise = loadImage(path).then(makeReferenceHeadMask);
  processedCache.set(key, promise);
  return promise;
}

async function loadHeadImage(headName) {
  try {
    return await processedReferenceHeadImage(assetPath.headReference(headName));
  } catch (error) {
    console.warn(`高画質頭画像を読み込めなかったため従来画像を使用します: ${headName}`, error);
    return processedHeadImage(assetPath.head(headName));
  }
}

function removeBlackBackground(image, dilationRadius = 1, fillEnclosed = false) {
  const source = makeCanvas(image.naturalWidth, image.naturalHeight);
  const context = source.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);

  const imageData = context.getImageData(0, 0, source.width, source.height);
  const data = imageData.data;
  const pixelCount = source.width * source.height;
  const seed = new Uint8Array(pixelCount);
  const barrier = new Uint8Array(pixelCount);

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    const brightness = Math.max(data[offset], data[offset + 1], data[offset + 2]);
    if (data[offset + 3] > 8 && brightness > 16) seed[pixelIndex] = 1;
  }

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const pixelIndex = y * source.width + x;
      if (!seed[pixelIndex]) continue;
      for (let deltaY = -dilationRadius; deltaY <= dilationRadius; deltaY += 1) {
        for (let deltaX = -dilationRadius; deltaX <= dilationRadius; deltaX += 1) {
          if (deltaX * deltaX + deltaY * deltaY > dilationRadius * dilationRadius + 1) continue;
          const targetX = x + deltaX;
          const targetY = y + deltaY;
          if (targetX < 0 || targetY < 0 || targetX >= source.width || targetY >= source.height) continue;
          barrier[targetY * source.width + targetX] = 1;
        }
      }
    }
  }

  const exterior = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let queueStart = 0;
  let queueEnd = 0;
  const enqueue = pixelIndex => {
    if (pixelIndex < 0 || pixelIndex >= pixelCount || exterior[pixelIndex] || barrier[pixelIndex]) return;
    exterior[pixelIndex] = 1;
    queue[queueEnd++] = pixelIndex;
  };

  for (let x = 0; x < source.width; x += 1) {
    enqueue(x);
    enqueue((source.height - 1) * source.width + x);
  }
  for (let y = 0; y < source.height; y += 1) {
    enqueue(y * source.width);
    enqueue(y * source.width + source.width - 1);
  }

  while (queueStart < queueEnd) {
    const pixelIndex = queue[queueStart++];
    const x = pixelIndex % source.width;
    const y = Math.floor(pixelIndex / source.width);
    if (x > 0) enqueue(pixelIndex - 1);
    if (x < source.width - 1) enqueue(pixelIndex + 1);
    if (y > 0) enqueue(pixelIndex - source.width);
    if (y < source.height - 1) enqueue(pixelIndex + source.width);
  }

  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    const foreground = fillEnclosed ? !exterior[pixelIndex] : Boolean(barrier[pixelIndex]);
    data[offset + 3] = foreground ? 255 : 0;
    if (!foreground) continue;
    const x = pixelIndex % source.width;
    const y = Math.floor(pixelIndex / source.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  context.putImageData(imageData, 0, 0);
  const bbox = maxX >= minX
    ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : { x: 0, y: 0, width: source.width, height: source.height };
  return { canvas: source, bbox };
}

async function processedBlackImage(path, dilationRadius = 1, fillEnclosed = false) {
  const key = `${path}|black|${dilationRadius}|${fillEnclosed}`;
  if (processedCache.has(key)) return processedCache.get(key);
  const promise = loadImage(path).then(image => removeBlackBackground(image, dilationRadius, fillEnclosed));
  processedCache.set(key, promise);
  return promise;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  const expanded = value.length === 3 ? value.split("").map(char => char + char).join("") : value;
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16)
  };
}

async function sampleColor(path) {
  if (colorCache.has(path)) return colorCache.get(path);
  const promise = loadImage(path).then(image => {
    const sample = makeCanvas(1, 1);
    const context = sample.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, Math.floor(image.naturalWidth / 2), Math.floor(image.naturalHeight / 2), 1, 1, 0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return { r, g, b };
  });
  colorCache.set(path, promise);
  return promise;
}

function fitRect(bbox, maxWidth, maxHeight, centerX, bottomY) {
  const scale = Math.min(maxWidth / bbox.width, maxHeight / bbox.height);
  const width = bbox.width * scale;
  const height = bbox.height * scale;
  return { x: centerX - width / 2, y: bottomY - height, width, height };
}

function drawCropped(context, processed, rect) {
  const { bbox } = processed;
  context.drawImage(
    processed.canvas,
    bbox.x, bbox.y, bbox.width, bbox.height,
    rect.x, rect.y, rect.width, rect.height
  );
}

function drawOriginalPart(context, image, centerX, centerY, width) {
  const height = width * image.naturalHeight / image.naturalWidth;
  context.save();
  context.filter = "none";
  context.globalAlpha = 1;
  context.drawImage(
    image,
    centerX - width / 2,
    centerY - height / 2,
    width,
    height
  );
  context.restore();
}

function drawOriginalLayer(context, image, x, y, width, height) {
  context.save();
  context.filter = "none";
  context.globalAlpha = 1;
  context.drawImage(image, x, y, width, height);
  context.restore();
}

function tintOriginalImage(image, color, normalizeBrightness = false) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const result = makeCanvas(width, height);
  const context = result.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  let referenceLuminance = 255;

  if (normalizeBrightness) {
    const luminances = [];
    for (let offset = 0; offset < data.length; offset += 4) {
      if (data[offset + 3] <= 8) continue;
      const luminance = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
      if (luminance > 16) luminances.push(luminance);
    }
    luminances.sort((a, b) => a - b);
    referenceLuminance = luminances[Math.floor(luminances.length * 0.85)] || 255;
  }

  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) continue;
    const luminance = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
    const brightness = Math.min(1, luminance / referenceLuminance);
    data[offset] = Math.round(color.r * brightness);
    data[offset + 1] = Math.round(color.g * brightness);
    data[offset + 2] = Math.round(color.b * brightness);
  }

  context.putImageData(imageData, 0, 0);
  return result;
}

async function makePatternCanvas(patternName, color1, color2) {
  const result = makeCanvas(96, 96);
  const context = result.getContext("2d", { willReadFrequently: true });

  if (patternName === "なし") {
    context.fillStyle = `rgb(${color1.r} ${color1.g} ${color1.b})`;
    context.fillRect(0, 0, result.width, result.height);
    return result;
  }

  const patternImage = await loadImage(assetPath.pattern(patternName));
  context.drawImage(patternImage, 0, 0, result.width, result.height);
  const imageData = context.getImageData(0, 0, result.width, result.height);
  const data = imageData.data;

  for (let offset = 0; offset < data.length; offset += 4) {
    const luminance = (data[offset] + data[offset + 1] + data[offset + 2]) / (3 * 255);
    const amount = 1 - luminance;
    data[offset] = Math.round(color1.r * (1 - amount) + color2.r * amount);
    data[offset + 1] = Math.round(color1.g * (1 - amount) + color2.g * amount);
    data[offset + 2] = Math.round(color1.b * (1 - amount) + color2.b * amount);
    data[offset + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
  return result;
}

async function makeHeadTextureCanvas(headProcessed, patternName, color1, color2) {
  const pattern = await makePatternCanvas(patternName, color1, color2);
  const patternContext = pattern.getContext("2d", { willReadFrequently: true });
  const patternData = patternContext.getImageData(0, 0, pattern.width, pattern.height).data;
  const headContext = headProcessed.canvas.getContext("2d", { willReadFrequently: true });
  const headData = headContext.getImageData(0, 0, headProcessed.canvas.width, headProcessed.canvas.height).data;
  const { bbox } = headProcessed;
  const texture = makeCanvas(bbox.width, bbox.height);
  const textureContext = texture.getContext("2d", { willReadFrequently: true });
  const textureData = textureContext.createImageData(texture.width, texture.height);

  for (let y = 0; y < texture.height; y += 1) {
    for (let x = 0; x < texture.width; x += 1) {
      const headOffset = ((bbox.y + y) * headProcessed.canvas.width + bbox.x + x) * 4;
      const textureOffset = (y * texture.width + x) * 4;
      if (headData[headOffset + 3] < 8) continue;

      const patternX = x / Math.max(1, texture.width - 1) * (pattern.width - 1);
      const patternY = y / Math.max(1, texture.height - 1) * (pattern.height - 1);
      const x0 = Math.floor(patternX);
      const y0 = Math.floor(patternY);
      const x1 = Math.min(pattern.width - 1, x0 + 1);
      const y1 = Math.min(pattern.height - 1, y0 + 1);
      const mixX = patternX - x0;
      const mixY = patternY - y0;
      const topLeft = (y0 * pattern.width + x0) * 4;
      const topRight = (y0 * pattern.width + x1) * 4;
      const bottomLeft = (y1 * pattern.width + x0) * 4;
      const bottomRight = (y1 * pattern.width + x1) * 4;
      const sampleChannel = channel => {
        const top = patternData[topLeft + channel] * (1 - mixX) + patternData[topRight + channel] * mixX;
        const bottom = patternData[bottomLeft + channel] * (1 - mixX) + patternData[bottomRight + channel] * mixX;
        return top * (1 - mixY) + bottom * mixY;
      };
      const sourcePixelIndex = (bbox.y + y) * headProcessed.canvas.width + bbox.x + x;
      const capturedLight = headProcessed.lightingMap?.[sourcePixelIndex] || 0;
      let shade;
      let highlight;

      if (capturedLight > 0) {
        const relativeLight = capturedLight / headProcessed.lightingAverage;
        shade = Math.max(0.64, Math.min(1.28, 1 + (relativeLight - 1) * 0.92));
        highlight = Math.max(0, Math.min(0.2, (relativeLight - 1.12) * 0.52));
      } else {
        const normalizedX = x / Math.max(1, texture.width - 1);
        const normalizedY = y / Math.max(1, texture.height - 1);
        const distance = Math.hypot((normalizedX - 0.36) * 0.9, (normalizedY - 0.22) * 0.72);
        shade = Math.max(0.72, Math.min(1.12, 1.1 - distance * 0.34));
        highlight = Math.max(0, 0.08 - distance * 0.1);
      }

      // The source render contains a contact shadow around its original face.
      // Keep the face area flat, then blend back to the captured 3D lighting
      // only on the outer part of the head so other outlines do not expose it.
      if (headProcessed.faceBounds) {
        const face = headProcessed.faceBounds;
        const sourceX = bbox.x + x;
        const sourceY = bbox.y + y;
        const centerX = face.x + face.width / 2;
        const centerY = face.y + face.height / 2;
        const faceDistance = Math.hypot(
          (sourceX - centerX) / Math.max(1, face.width / 2),
          (sourceY - centerY) / Math.max(1, face.height / 2)
        );
        const blendPosition = Math.max(0, Math.min(1, (faceDistance - 1.12) / 0.3));
        const outerLightingWeight = blendPosition * blendPosition * (3 - 2 * blendPosition);
        shade = 1 + (shade - 1) * outerLightingWeight;
        highlight *= outerLightingWeight;
      }

      textureData.data[textureOffset] = Math.min(255, Math.round(sampleChannel(0) * shade + 255 * highlight));
      textureData.data[textureOffset + 1] = Math.min(255, Math.round(sampleChannel(1) * shade + 255 * highlight));
      textureData.data[textureOffset + 2] = Math.min(255, Math.round(sampleChannel(2) * shade + 255 * highlight));
      textureData.data[textureOffset + 3] = headData[headOffset + 3];
    }
  }

  textureContext.putImageData(textureData, 0, 0);
  return texture;
}

function calculateHeadRect(headProcessed) {
  const bbox = headProcessed.bbox;
  const scale = 720 / Math.max(bbox.width, bbox.height);
  return {
    width: bbox.width * scale,
    height: bbox.height * scale,
    x: CANVAS_SIZE / 2 - bbox.width * scale / 2,
    y: 880 - bbox.height * scale
  };
}

async function drawHead(context, headProcessed, patternName, color1, color2, rect) {
  const texture = await makeHeadTextureCanvas(headProcessed, patternName, color1, color2);
  drawOriginalLayer(context, texture, rect.x, rect.y, rect.width, rect.height);
}

function findLinkedFace(id) {
  return linkedFaceMap.find(item => Number(item.id) === Number(id)) || linkedFaceMap[0];
}

async function renderComposition(targetCanvas, { transparent = false } = {}) {
  const context = targetCanvas.getContext("2d");
  context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  if (!transparent) {
    context.fillStyle = state.background;
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }

  const linked = findLinkedFace(state.linkedFace);
  if (!linked) throw new Error("髪・輪郭の対応データがありません。");
  const headPromise = loadHeadImage(state.head);

  const [
    headProcessed,
    antennaProcessed,
    faceLayer,
    hairImage,
    eyebrowImage,
    eyeImage,
    noseImage,
    mouthImage,
    cheekImage,
    bodyColor1,
    bodyColor2,
    skinColor,
    hairColor
  ] = await Promise.all([
    headPromise,
    processedImage(assetPath.antenna(state.antenna), 28),
    processedBlackImage(assetPath.face(linked.face_file), 2, false),
    loadImage(assetPath.hair(linked.hair_file)),
    loadImage(assetPath.eyebrow(state.eyebrow)),
    loadImage(assetPath.eye(state.eye)),
    loadImage(assetPath.nose(state.nose)),
    loadImage(assetPath.mouth(state.mouth)),
    loadImage(assetPath.cheek(state.cheek)),
    sampleColor(assetPath.bodyColor(state.bodyColor1)),
    sampleColor(assetPath.bodyColor(state.bodyColor2)),
    sampleColor(assetPath.skinColor(state.skinColor)),
    sampleColor(assetPath.hairColor(state.hairColor))
  ]);

  let headRect = calculateHeadRect(headProcessed);
  let antennaRect = null;
  if (state.antenna !== "アンテナなし") {
    const antennaOffset = HEAD_ANTENNA_OFFSETS[state.head] || { x: 0, y: 0 };
    const antennaAnchor = headProcessed.antennaAnchor || {
      x: headProcessed.bbox.x + headProcessed.bbox.width / 2,
      y: headProcessed.bbox.y
    };
    const anchorX = headRect.x
      + (antennaAnchor.x - headProcessed.bbox.x) / headProcessed.bbox.width * headRect.width;
    const anchorY = headRect.y
      + (antennaAnchor.y - headProcessed.bbox.y) / headProcessed.bbox.height * headRect.height;
    antennaRect = fitRect(
      antennaProcessed.bbox,
      178,
      205,
      anchorX + antennaOffset.x,
      anchorY + 14 + antennaOffset.y
    );
    const requiredShift = Math.max(0, 34 - antennaRect.y);
    const availableShift = Math.max(0, 990 - (headRect.y + headRect.height));
    const shift = Math.min(requiredShift, availableShift);
    if (shift > 0) {
      headRect = { ...headRect, y: headRect.y + shift };
      antennaRect = { ...antennaRect, y: antennaRect.y + shift };
    }
  }

  await drawHead(context, headProcessed, state.pattern, bodyColor1, bodyColor2, headRect);
  if (antennaRect) drawCropped(context, antennaProcessed, antennaRect);

  let frameWidth;
  let frameHeight;
  let frameX;
  let frameY;
  if (headProcessed.faceBounds) {
    const targetFace = {
      x: headRect.x + (headProcessed.faceBounds.x - headProcessed.bbox.x) / headProcessed.bbox.width * headRect.width,
      y: headRect.y + (headProcessed.faceBounds.y - headProcessed.bbox.y) / headProcessed.bbox.height * headRect.height,
      width: headProcessed.faceBounds.width / headProcessed.bbox.width * headRect.width,
      height: headProcessed.faceBounds.height / headProcessed.bbox.height * headRect.height
    };
    const scaleX = targetFace.width / faceLayer.bbox.width;
    const scaleY = targetFace.height / faceLayer.bbox.height;
    frameWidth = faceLayer.canvas.width * scaleX;
    frameHeight = faceLayer.canvas.height * scaleY;
    frameX = targetFace.x - faceLayer.bbox.x * scaleX;
    frameY = targetFace.y - faceLayer.bbox.y * scaleY;
  } else {
    const frameSize = Math.max(310, Math.min(470, headRect.width * 0.64));
    const faceBottom = Math.min(925, headRect.y + headRect.height - 22);
    frameWidth = frameSize;
    frameHeight = frameSize;
    frameX = CANVAS_SIZE / 2 - frameSize / 2;
    frameY = faceBottom - frameSize * (125 / 144);
  }

  const tintedFace = tintOriginalImage(faceLayer.canvas, skinColor, true);
  const tintedHair = tintOriginalImage(hairImage, hairColor);
  drawOriginalLayer(context, tintedFace, frameX, frameY, frameWidth, frameHeight);

  const scale = frameWidth / 460;
  const faceCenterX = frameX + frameWidth / 2;

  drawOriginalPart(context, cheekImage, faceCenterX, frameY + frameHeight * 0.66, 275 * scale);
  drawOriginalPart(context, eyebrowImage, faceCenterX, frameY + frameHeight * 0.32, 245 * scale);
  drawOriginalPart(context, eyeImage, faceCenterX, frameY + frameHeight * 0.48, 265 * scale);
  drawOriginalPart(context, noseImage, faceCenterX, frameY + frameHeight * 0.60, 125 * scale);
  drawOriginalPart(context, mouthImage, faceCenterX, frameY + frameHeight * 0.73, 215 * scale);
  drawOriginalLayer(context, tintedHair, frameX, frameY, frameWidth, frameHeight);
}

async function renderPreview() {
  const ticket = ++renderTicket;
  statusElement.textContent = "描画中";
  try {
    const stagingCanvas = makeCanvas(CANVAS_SIZE, CANVAS_SIZE);
    await renderComposition(stagingCanvas);
    if (ticket !== renderTicket) return;
    const previewContext = canvas.getContext("2d");
    previewContext.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    previewContext.drawImage(stagingCanvas, 0, 0);
    statusElement.textContent = "更新済み";
    loadingCover.classList.add("is-hidden");
  } catch (error) {
    console.error(error);
    if (ticket !== renderTicket) return;
    statusElement.textContent = "読込エラー";
    loadingCover.querySelector("span:last-child").textContent = "素材の読み込みに失敗しました";
  }
}

let renderTimer;
function queueRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPreview, 40);
}

function makeDetails(title, key, initialOpen = false) {
  const details = document.createElement("details");
  details.className = "control-group";
  details.dataset.stateKey = key;
  details.open = initialOpen;

  const summary = document.createElement("summary");
  const titleElement = document.createElement("span");
  titleElement.className = "summary-title";
  titleElement.textContent = title;
  const valueElement = document.createElement("span");
  valueElement.className = "summary-value";
  summary.append(titleElement, valueElement);

  const body = document.createElement("div");
  body.className = "group-body";
  details.append(summary, body);
  controls.append(details);
  return { details, body, valueElement };
}

function updatePickerSelection(key, valueLabel) {
  const group = controls.querySelector(`[data-state-key="${key}"]`);
  if (!group) return;
  group.querySelectorAll(".asset-button, .swatch-button").forEach(button => {
    const selected = String(button.dataset.value) === String(state[key]);
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  const selectedButton = Array.from(group.querySelectorAll("[data-value]")).find(button => String(button.dataset.value) === String(state[key]));
  group.querySelector(".summary-value").textContent = valueLabel || selectedButton?.dataset.label || String(state[key]);
}

function addImagePicker({ title, key, values, path, label = value => String(value), wide = false, searchable = false, open = false }) {
  const { body } = makeDetails(title, key, open);
  let searchInput;
  if (searchable) {
    const tools = document.createElement("div");
    tools.className = "picker-tools";
    searchInput = document.createElement("input");
    searchInput.className = "picker-search";
    searchInput.type = "search";
    searchInput.placeholder = `${title}を検索`;
    searchInput.setAttribute("aria-label", `${title}を検索`);
    tools.append(searchInput);
    body.append(tools);
  }

  const grid = document.createElement("div");
  grid.className = `asset-grid${wide ? " wide-grid" : ""}`;
  const empty = document.createElement("p");
  empty.className = "empty-result";
  empty.textContent = "一致する項目がありません";

  values.forEach(value => {
    const itemLabel = label(value);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "asset-button";
    button.dataset.value = String(value);
    button.dataset.label = itemLabel;
    button.title = itemLabel;
    button.setAttribute("aria-label", `${title}: ${itemLabel}`);

    const image = document.createElement("img");
    image.className = "asset-thumb";
    image.src = path(value);
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";

    const caption = document.createElement("span");
    caption.className = "asset-label";
    caption.textContent = itemLabel;
    button.append(image, caption);
    button.addEventListener("click", () => {
      state[key] = typeof value === "number" ? Number(value) : value;
      updatePickerSelection(key);
      queueRender();
    });
    grid.append(button);
  });

  grid.append(empty);
  body.append(grid);

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const query = searchInput.value.trim().toLocaleLowerCase("ja");
      let visibleCount = 0;
      grid.querySelectorAll(".asset-button").forEach(button => {
        const visible = button.dataset.label.toLocaleLowerCase("ja").includes(query);
        button.hidden = !visible;
        if (visible) visibleCount += 1;
      });
      empty.classList.toggle("is-visible", visibleCount === 0);
    });
  }

  updatePickerSelection(key);
}

function addSwatchPicker({ title, key, values, path, label = value => String(value), open = false }) {
  const { body } = makeDetails(title, key, open);
  const grid = document.createElement("div");
  grid.className = "swatch-grid";

  values.forEach(value => {
    const itemLabel = label(value);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "swatch-button";
    button.dataset.value = String(value);
    button.dataset.label = itemLabel;
    button.title = itemLabel;
    button.setAttribute("aria-label", `${title}: ${itemLabel}`);

    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.backgroundImage = `url("${path(value)}")`;
    const caption = document.createElement("span");
    caption.className = "swatch-label";
    caption.textContent = itemLabel;
    button.append(swatch, caption);
    button.addEventListener("click", () => {
      state[key] = typeof value === "number" ? Number(value) : value;
      updatePickerSelection(key);
      queueRender();
    });
    grid.append(button);
  });

  body.append(grid);
  updatePickerSelection(key);
}

function addBackgroundControl() {
  const { body, valueElement } = makeDetails("背景色", "background");
  const wrapper = document.createElement("div");
  wrapper.className = "background-controls";
  const colorInput = document.createElement("input");
  colorInput.className = "color-input";
  colorInput.type = "color";
  colorInput.value = state.background;
  colorInput.setAttribute("aria-label", "背景色を選択");

  const textField = document.createElement("label");
  textField.className = "field";
  textField.textContent = "カラーコード";
  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.value = state.background;
  textInput.maxLength = 7;
  textInput.spellcheck = false;
  textField.append(textInput);

  const apply = value => {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return;
    state.background = value.toLowerCase();
    colorInput.value = state.background;
    textInput.value = state.background;
    valueElement.textContent = state.background;
    queueRender();
  };
  colorInput.addEventListener("input", () => apply(colorInput.value));
  textInput.addEventListener("change", () => apply(textInput.value.trim()));
  wrapper.append(colorInput, textField);
  body.append(wrapper);
  valueElement.textContent = state.background;
}

function buildControls() {
  controls.replaceChildren();
  addImagePicker({ title: "頭", key: "head", values: HEADS, path: assetPath.head, searchable: true, open: true });
  addImagePicker({ title: "アンテナ", key: "antenna", values: ANTENNAS, path: assetPath.antenna, searchable: true });
  addImagePicker({ title: "柄", key: "pattern", values: PATTERNS, path: assetPath.pattern, searchable: true });
  addSwatchPicker({ title: "色1", key: "bodyColor1", values: BODY_COLORS, path: assetPath.bodyColor });
  addSwatchPicker({ title: "色2", key: "bodyColor2", values: BODY_COLORS, path: assetPath.bodyColor });
  addImagePicker({ title: "髪・輪郭", key: "linkedFace", values: linkedFaceMap.map(item => Number(item.id)), path: assetPath.linkedFace, label: value => `ID ${value}`, wide: true, searchable: true });
  addSwatchPicker({ title: "肌色", key: "skinColor", values: range(16), path: assetPath.skinColor, label: value => `肌 ${value}` });
  addSwatchPicker({ title: "髪色", key: "hairColor", values: range(25), path: assetPath.hairColor, label: value => `髪 ${value}` });
  addImagePicker({ title: "眉", key: "eyebrow", values: range(39), path: assetPath.eyebrow, label: value => `ID ${value}` });
  addImagePicker({ title: "目", key: "eye", values: range(68), path: assetPath.eye, label: value => `ID ${value}` });
  addImagePicker({ title: "鼻", key: "nose", values: range(42), path: assetPath.nose, label: value => `ID ${value}` });
  addImagePicker({ title: "口", key: "mouth", values: range(71), path: assetPath.mouth, label: value => `ID ${value}` });
  addImagePicker({ title: "頬", key: "cheek", values: range(14), path: assetPath.cheek, label: value => `ID ${value}` });
  addBackgroundControl();
  controls.setAttribute("aria-busy", "false");
}

function refreshAllSelections() {
  Object.keys(INITIAL_STATE).forEach(key => updatePickerSelection(key));
  const backgroundGroup = controls.querySelector('[data-state-key="background"]');
  if (backgroundGroup) {
    backgroundGroup.querySelector('input[type="color"]').value = state.background;
    backgroundGroup.querySelector('input[type="text"]').value = state.background;
    backgroundGroup.querySelector(".summary-value").textContent = state.background;
  }
}

async function downloadPng() {
  const button = document.querySelector("#download-button");
  const transparent = document.querySelector("#export-background").value === "transparent";
  button.disabled = true;
  button.textContent = "作成中…";
  try {
    const exportCanvas = makeCanvas(CANVAS_SIZE, CANVAS_SIZE);
    await renderComposition(exportCanvas, { transparent });
    const blob = await new Promise((resolve, reject) => {
      exportCanvas.toBlob(result => result ? resolve(result) : reject(new Error("PNGを作成できませんでした。")), "image/png");
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `denpamen-face-${Date.now()}.png`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    console.error(error);
    window.alert("PNGの保存に失敗しました。ページを再読み込みしてお試しください。");
  } finally {
    button.disabled = false;
    button.innerHTML = '<span aria-hidden="true">↓</span> PNG保存';
  }
}

function wireGlobalActions() {
  document.querySelector("#download-button").addEventListener("click", downloadPng);
  document.querySelector("#reset-button").addEventListener("click", () => {
    state = { ...INITIAL_STATE };
    refreshAllSelections();
    queueRender();
  });

  const collapseButton = document.querySelector("#collapse-button");
  collapseButton.addEventListener("click", () => {
    const groups = Array.from(controls.querySelectorAll("details"));
    const shouldOpen = groups.every(group => !group.open);
    groups.forEach(group => { group.open = shouldOpen; });
    collapseButton.textContent = shouldOpen ? "すべて閉じる" : "すべて開く";
  });
}

async function initialize() {
  try {
    const response = await fetch("髪・輪郭画像/髪-輪郭対応マップ.json");
    if (!response.ok) throw new Error(`対応マップの読み込みに失敗しました (${response.status})`);
    linkedFaceMap = await response.json();
    buildControls();
    wireGlobalActions();
    await renderPreview();
  } catch (error) {
    console.error(error);
    controls.innerHTML = '<p class="empty-result is-visible">初期化に失敗しました。GitHub Pagesまたはローカルサーバーから開いてください。</p>';
    loadingCover.querySelector("span:last-child").textContent = "初期化に失敗しました";
    statusElement.textContent = "エラー";
  }
}

const EMBEDDED_DEFAULT_STATE = Object.freeze({
  head: "よこまる",
  antenna: "アンテナなし",
  pattern: "なし",
  bodyColor1: "黒",
  bodyColor2: "黒",
  linkedFace: 0,
  skinColor: 0,
  hairColor: 0,
  eyebrow: 0,
  eye: 0,
  nose: 0,
  mouth: 0,
  cheek: 0,
  background: "#000000"
});

const BODY_COLOR_ALIASES = Object.freeze({
  "黄色": "黄",
  "水色": "水",
  "濃黄色": "濃黄",
  "濃水色": "濃水",
  "薄黄色": "薄黄",
  "薄水色": "薄水",
  "通常黒": "黒",
  "通常赤": "赤",
  "通常水色": "水",
  "通常緑": "緑",
  "通常橙": "橙",
  "通常黄色": "黄",
  "通常青": "青",
  "通常白": "白",
  "通常紫": "紫",
  "通常桃": "桃",
  "通常金": "金",
  "通常銀": "銀"
});

function statusValue(statusText, key) {
  const source = String(statusText || "");
  // 色だけは2色を空白区切りで持てる。次の「項目名:」までを値として扱う。
  // それ以外はすべて単一トークンなので、未知の項目（体格など）が後続しても巻き込まない。
  const pattern = key === "色"
    ? /色:([\s\S]*?)(?=\s+\S+:|$)/
    : new RegExp(`${key}:(\\S+)`);
  const match = source.match(pattern);
  return match ? match[1].trim() : "";
}

function findAppearanceStatusStart(text) {
  const source = String(text || "");
  const positions = ["アンテナ:", "頭:"]
    .map(label => source.indexOf(label))
    .filter(position => position >= 0);
  return positions.length ? Math.min(...positions) : -1;
}

function normalizeBodyColor(value, fallback) {
  const normalized = BODY_COLOR_ALIASES[value] || value;
  return BODY_COLORS.includes(normalized) ? normalized : fallback;
}

function numericStatusValue(statusText, key, minimum, maximum, fallback) {
  const value = Number.parseInt(statusValue(statusText, key), 10);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function parseAppearanceStatus(statusText) {
  const head = statusValue(statusText, "頭");
  const antenna = statusValue(statusText, "アンテナ");
  const pattern = statusValue(statusText, "柄");
  const colors = statusValue(statusText, "色").split(/\s+/).filter(Boolean);
  const bodyColor1 = normalizeBodyColor(colors[0], EMBEDDED_DEFAULT_STATE.bodyColor1);
  const bodyColor2 = normalizeBodyColor(colors[1], bodyColor1);

  return {
    ...EMBEDDED_DEFAULT_STATE,
    head: HEADS.includes(head) ? head : EMBEDDED_DEFAULT_STATE.head,
    antenna: ANTENNAS.includes(antenna) ? antenna : EMBEDDED_DEFAULT_STATE.antenna,
    pattern: PATTERNS.includes(pattern) ? pattern : EMBEDDED_DEFAULT_STATE.pattern,
    bodyColor1,
    bodyColor2,
    linkedFace: numericStatusValue(statusText, "髪", 0, 94, EMBEDDED_DEFAULT_STATE.linkedFace),
    skinColor: numericStatusValue(statusText, "肌色", 0, 15, EMBEDDED_DEFAULT_STATE.skinColor),
    hairColor: numericStatusValue(statusText, "髪色", 0, 24, EMBEDDED_DEFAULT_STATE.hairColor),
    eyebrow: numericStatusValue(statusText, "眉", 0, 38, EMBEDDED_DEFAULT_STATE.eyebrow),
    eye: numericStatusValue(statusText, "目", 0, 67, EMBEDDED_DEFAULT_STATE.eye),
    nose: numericStatusValue(statusText, "鼻", 0, 41, EMBEDDED_DEFAULT_STATE.nose),
    mouth: numericStatusValue(statusText, "口", 0, 70, EMBEDDED_DEFAULT_STATE.mouth),
    cheek: numericStatusValue(statusText, "頬", 0, 13, EMBEDDED_DEFAULT_STATE.cheek)
  };
}

let embeddedInitializationPromise = null;
let embeddedRenderQueue = Promise.resolve();
let embeddedThumbnailStagingCanvas = null;
const embeddedThumbnailCache = new Map();
const EMBEDDED_THUMBNAIL_CACHE_LIMIT = 64;

function ensureEmbeddedRendererInitialized() {
  if (!embeddedInitializationPromise) {
    embeddedInitializationPromise = fetch(`${FACE_ASSET_ROOT}/髪・輪郭画像/髪-輪郭対応マップ.json`)
      .then(response => {
        if (!response.ok) throw new Error(`髪・輪郭の対応マップを読み込めませんでした (${response.status})`);
        return response.json();
      })
      .then(map => {
        linkedFaceMap = map;
      });
  }
  return embeddedInitializationPromise;
}

function renderStatusFace(targetCanvas, statusText, { transparent = true } = {}) {
  const requestedState = parseAppearanceStatus(statusText);
  embeddedRenderQueue = embeddedRenderQueue.catch(() => undefined).then(async () => {
    await ensureEmbeddedRendererInitialized();
    targetCanvas.width = CANVAS_SIZE;
    targetCanvas.height = CANVAS_SIZE;
    state = requestedState;
    await renderComposition(targetCanvas, { transparent });
  });
  return embeddedRenderQueue;
}

function drawThumbnailCanvas(targetCanvas, sourceCanvas, size) {
  targetCanvas.width = size;
  targetCanvas.height = size;
  const context = targetCanvas.getContext("2d");
  context.clearRect(0, 0, size, size);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(sourceCanvas, 0, 0, size, size);
}

function renderStatusThumbnail(targetCanvas, statusText, { size = 96 } = {}) {
  const thumbnailSize = Math.max(48, Math.min(256, Math.round(Number(size) || 96)));
  const requestedState = parseAppearanceStatus(statusText);
  const cacheKey = `${thumbnailSize}|${JSON.stringify(requestedState)}`;
  const cached = embeddedThumbnailCache.get(cacheKey);
  if (cached) {
    embeddedThumbnailCache.delete(cacheKey);
    embeddedThumbnailCache.set(cacheKey, cached);
    drawThumbnailCanvas(targetCanvas, cached, thumbnailSize);
    return Promise.resolve();
  }

  embeddedRenderQueue = embeddedRenderQueue.catch(() => undefined).then(async () => {
    const queuedCached = embeddedThumbnailCache.get(cacheKey);
    if (queuedCached) {
      drawThumbnailCanvas(targetCanvas, queuedCached, thumbnailSize);
      return;
    }

    await ensureEmbeddedRendererInitialized();
    embeddedThumbnailStagingCanvas ||= makeCanvas(CANVAS_SIZE, CANVAS_SIZE);
    state = requestedState;
    await renderComposition(embeddedThumbnailStagingCanvas, { transparent: true });

    const thumbnail = makeCanvas(thumbnailSize, thumbnailSize);
    drawThumbnailCanvas(thumbnail, embeddedThumbnailStagingCanvas, thumbnailSize);
    drawThumbnailCanvas(targetCanvas, thumbnail, thumbnailSize);
    embeddedThumbnailCache.set(cacheKey, thumbnail);

    if (embeddedThumbnailCache.size > EMBEDDED_THUMBNAIL_CACHE_LIMIT) {
      const oldestKey = embeddedThumbnailCache.keys().next().value;
      embeddedThumbnailCache.delete(oldestKey);
    }
  });
  return embeddedRenderQueue;
}

function hasCompleteAppearance(statusText) {
  const colors = statusValue(statusText, "色").split(/\s+/).filter(Boolean);
  if (!HEADS.includes(statusValue(statusText, "頭")) || !ANTENNAS.includes(statusValue(statusText, "アンテナ")) ||
      !PATTERNS.includes(statusValue(statusText, "柄")) || !normalizeBodyColor(colors[0], null)) return false;
  if (statusValue(statusText, "柄") !== "なし" && !normalizeBodyColor(colors[1], null)) return false;
  return [["髪", 94], ["肌色", 15], ["髪色", 24], ["眉", 38], ["目", 67], ["鼻", 41], ["口", 70], ["頬", 13]]
    .every(([key, max]) => {
      const value = statusValue(statusText, key);
      return /^\d+$/.test(value) && Number(value) <= max;
    });
}

window.DenpamenFaceRenderer = Object.freeze({
  antennas: [...ANTENNAS],
  bodyColors: [...BODY_COLORS],
  heads: [...HEADS],
  patterns: [...PATTERNS],
  findStatusStart: findAppearanceStatusStart,
  parseStatus: parseAppearanceStatus,
  hasCompleteAppearance,
  render: renderStatusFace,
  renderThumbnail: renderStatusThumbnail
});
