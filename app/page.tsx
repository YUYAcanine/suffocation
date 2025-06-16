'use client';

import { useState, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import imageCompression from 'browser-image-compression';
import {
  TransformWrapper,
  TransformComponent,
} from 'react-zoom-pan-pinch';

/* ---------- 型 ---------- */
type Vertex = { x: number; y: number };
type BoundingBox = {
  description: string;
  boundingPoly: { vertices: Vertex[] };
};
type ParsedRow = { name: string; description: string };

/* ---------- コンポーネント ---------- */
export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<BoundingBox[]>([]);
  const [selectedText, setSelectedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [menuDescriptions, setMenuDescriptions] =
    useState<Record<string, string>>({});

  /* CSV 読み込み */
  useEffect(() => {
    fetch('/menu_descriptions.csv')
      .then((r) => r.text())
      .then((csv) => {
        Papa.parse(csv, {
          header: true,
          complete: (res) => {
            const map: Record<string, string> = {};
            (res.data as ParsedRow[]).forEach(({ name, description }) => {
              if (name && description) map[name.trim()] = description.trim();
            });
            setMenuDescriptions(map);
          },
        });
      });
  }, []);

  /* 画像アップロード → 圧縮 → OCR */
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        const base64 = (reader.result as string) || '';
        setImage(base64);

        const res = await fetch('/api/vision-ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64.split(',')[1] }),
        });

        const json = await res.json();
        const anns = json.responses?.[0]?.textAnnotations || [];

        setBoxes(
          anns.slice(1).map((ann: any) => ({
            description: ann.description,
            boundingPoly: {
              vertices: ann.boundingPoly.vertices.map((v: any) => ({
                x: v.x ?? 0,
                y: v.y ?? 0,
              })),
            },
          }))
        );
      };
      reader.readAsDataURL(compressed);
    } finally {
      setLoading(false);
    }
  };

  /* ボックス描画用スタイル */
  const getBoxStyle = (b: BoundingBox): React.CSSProperties => {
    const [v0, v1, v2] = b.boundingPoly.vertices;
    return {
      position: 'absolute',
      left: v0.x,
      top: v0.y,
      width: v1.x - v0.x,
      height: v2.y - v1.y,
      border: '2px solid red',
      pointerEvents: 'auto' as React.CSSProperties['pointerEvents'], // ← 型アサーションで解決
    };
  };

  return (
    <main className="h-screen flex flex-col text-black">
      {/* ヘッダー & アップロード */}
      <header className="p-4">
        <h1 className="text-xl font-bold mb-2">Google Vision OCR メニューアプリ</h1>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleImageUpload}
          className="w-full"
        />
      </header>

      {/* 画像ビュー（ピンチズーム対応） */}
      <section className="flex-1 bg-black overflow-hidden">
        {image && (
          <TransformWrapper doubleClick={{ disabled: true }}>
            <TransformComponent wrapperClass="w-full h-full">
              <div className="relative inline-block">
                <img src={image} alt="menu" className="block max-w-none" />
                {boxes.map((b, i) => (
                  <div
                    key={i}
                    style={getBoxStyle(b)}
                    onClick={() => setSelectedText(b.description)}
                    title={b.description}
                  />
                ))}
              </div>
            </TransformComponent>
          </TransformWrapper>
        )}
      </section>

      {/* ローディング */}
      {loading && (
        <p className="absolute top-4 right-4 bg-white/80 px-3 py-1 rounded">
          OCR処理中...
        </p>
      )}

      {/* 説明ポップアップ */}
      {selectedText && (
        <div className="fixed bottom-0 left-0 right-0 bg-white p-6 shadow-xl z-10 text-lg">
          <h2 className="font-bold mb-2">選択された料理：</h2>
          <p className="mb-2">{selectedText}</p>
          <h2 className="font-bold">説明：</h2>
          <p>{menuDescriptions[selectedText] || '説明は見つかりませんでした'}</p>
          <button
            className="mt-4 px-4 py-2 bg-gray-200 rounded"
            onClick={() => setSelectedText('')}
          >
            閉じる
          </button>
        </div>
      )}
    </main>
  );
}
