'use client';

import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import imageCompression from 'browser-image-compression';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

/* ---------- 型 ---------- */
type Vertex = { x: number; y: number };
type BoundingBox = { description: string; boundingPoly: { vertices: Vertex[] } };
type ParsedRow = { name: string; description: string };

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<BoundingBox[]>([]);
  const [selectedText, setSelectedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [menuDescriptions, setMenuDescriptions] = useState<Record<string, string>>({});
  const [scale, setScale] = useState<{ x: number; y: number }>({ x: 1, y: 1 });

  /* ---------- CSV 読み込み ---------- */
  useEffect(() => {
    fetch('/menu_descriptions.csv')
      .then(r => r.text())
      .then(csv =>
        Papa.parse(csv, {
          header: true,
          complete: res => {
            const map: Record<string, string> = {};
            (res.data as ParsedRow[]).forEach(({ name, description }) => {
              if (name && description) map[name.trim()] = description.trim();
            });
            setMenuDescriptions(map);
          },
        }),
      );
  }, []);

  /* ---------- 画像アップロード ---------- */
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1024,
        useWebWorker: true,
      });

      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        setImage(base64);

        const res = await fetch('/api/vision-ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64.split(',')[1] }),
        });

        const json = await res.json();
        const anns = (json.responses?.[0]?.textAnnotations ?? []) as unknown[];

        setBoxes(
          anns.slice(1).map((unk): BoundingBox => {
            const a = unk as {
              description: string;
              boundingPoly: { vertices: Partial<Vertex>[] };
            };
            return {
              description: a.description,
              boundingPoly: {
                vertices: a.boundingPoly.vertices.map(v => ({
                  x: v.x ?? 0,
                  y: v.y ?? 0,
                })),
              },
            };
          }),
        );
      };
      reader.readAsDataURL(compressed);
    } finally {
      setLoading(false);
    }
  };

  /* ---------- 画像読込時にスケール取得 ---------- */
  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    setScale({ x: el.clientWidth / el.naturalWidth, y: el.clientHeight / el.naturalHeight });
  };

  /* ---------- 戻る ---------- */
  const resetAll = () => {
    setImage(null);
    setBoxes([]);
    setSelectedText('');
  };

  /* ---------- ボックススタイル ---------- */
  const styleFromBox = (b: BoundingBox): React.CSSProperties => {
    const [v0, v1, v2] = b.boundingPoly.vertices;
    return {
      position: 'absolute',
      left: v0.x * scale.x,
      top: v0.y * scale.y,
      width: (v1.x - v0.x) * scale.x,
      height: (v2.y - v1.y) * scale.y,
      border: '2px solid red',
    };
  };

  /* ---------- JSX ---------- */
  return (
    <main className="h-screen flex flex-col text-black select-none">
      {/* === 画像が無いときの中央カメラボタン === */}
      {!image && (
        <div className="flex-1 flex items-center justify-center bg-gray-100">
          <label className="flex flex-col items-center justify-center w-40 h-40 bg-white shadow-lg rounded-full cursor-pointer hover:scale-105 transition">
            {/* SVG カメラアイコン */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-16 h-16 text-gray-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 7h4l2-3h6l2 3h4a2 2 0 012 2v10a2 2 0 01-2 2H3a2 2 0 01-2-2V9a2 2 0 012-2z"
              />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleUpload}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* === 画像ビュー === */}
      {image && (
        <section className="flex-1 bg-black overflow-hidden relative">
          {/* 戻るボタン（矢印） */}
          <button
            onClick={resetAll}
            className="fixed top-12 right-3 z-20 bg-white/80 hover:bg-white p-2 rounded shadow text-xl"
            aria-label="戻る"
          >
            ←
          </button>

          <TransformWrapper doubleClick={{ disabled: true }}>
            <TransformComponent wrapperClass="w-full h-full">
              <div className="relative inline-block mb-80">
                <img
                  src={image}
                  onLoad={onImgLoad}
                  alt="menu"
                  className="block max-w-full h-auto"
                />
                {boxes.map((b, i) => (
                  <div
                    key={i}
                    style={styleFromBox(b)}
                    onClick={() => setSelectedText(b.description)}
                  />
                ))}
              </div>
            </TransformComponent>
          </TransformWrapper>
        </section>
      )}

      {/* ローディング */}
      {loading && (
        <p className="absolute top-4 right-4 bg-white/80 px-3 py-1 rounded">OCR処理中...</p>
      )}

      {/* ポップアップ */}
      {selectedText && (
        <div className="fixed bottom-0 left-0 right-0 bg-white p-6 pb-12 shadow-xl z-30 text-lg">
          <button
            onClick={() => setSelectedText('')}
            className="absolute top-2 right-2 text-red-600 text-4xl leading-none"
            aria-label="閉じる"
          >
            ×
          </button>
          <h2 className="font-bold mb-2">選択された料理：</h2>
          <p className="mb-2">{selectedText}</p>
          <h2 className="font-bold">説明：</h2>
          <p>{menuDescriptions[selectedText] || '説明は見つかりませんでした'}</p>
        </div>
      )}
    </main>
  );
}
