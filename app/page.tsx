'use client';

import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import imageCompression from 'browser-image-compression';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

/* 型定義 */
type Vertex = { x: number; y: number };
type BoundingBox = { description: string; boundingPoly: { vertices: Vertex[] } };
type ParsedRow = { name: string; description: string };

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<BoundingBox[]>([]);
  const [selectedText, setSelectedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [menuDescriptions, setMenuDescriptions] = useState<Record<string, string>>({});

  /* CSV 読み込み */
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
        })
      );
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
          })
        );
      };
      reader.readAsDataURL(compressed);
    } finally {
      setLoading(false);
    }
  };

  /* 戻る（初期化） */
  const resetAll = () => {
    setImage(null);
    setBoxes([]);
    setSelectedText('');
  };

  /* ボックススタイル */
  const getBoxStyle = (b: BoundingBox): React.CSSProperties => {
    const [v0, v1, v2] = b.boundingPoly.vertices;
    return {
      position: 'absolute',
      left: v0.x,
      top: v0.y,
      width: v1.x - v0.x,
      height: v2.y - v1.y,
      border: '2px solid red',
      pointerEvents: 'auto',
    };
  };

  return (
    <main className="h-screen flex flex-col text-black select-none">
      {/* ヘッダーとアップロード（画像が無いときだけ表示） */}
      {!image && (
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
      )}

      {/* 画像ビュー & 戻るボタン */}
      <section className="flex-1 bg-black overflow-hidden relative">
        {image && (
          <>
            {/* 戻るボタン */}
            <button
              onClick={resetAll}
              className="fixed top-3 right-3 z-20 bg-white/80 hover:bg-white p-2 rounded shadow"
            >
              戻る
            </button>

            <TransformWrapper doubleClick={{ disabled: true }}>
              <TransformComponent wrapperClass="w-full h-full">
                {/* 上余白なし、下余白を大きく (mb-40=10rem) */}
                <div className="relative inline-block mb-200">
                  <img src={image} alt="menu" className="block max-w-none" />

                  {boxes.map((b, i) => (
                    <div
                      key={i}
                      style={getBoxStyle(b)}
                      onClick={() => setSelectedText(b.description)}
                    />
                  ))}
                </div>
              </TransformComponent>
            </TransformWrapper>
          </>
        )}
      </section>

      {/* ローディング */}
      {loading && (
        <p className="absolute top-4 right-4 bg-white/80 px-3 py-1 rounded">OCR処理中...</p>
      )}

      {/* 説明ポップアップ */}
      {selectedText && (
        <div className="fixed bottom-0 left-0 right-0 bg-white p-6 pb-12 shadow-xl z-30 text-lg">
          {/* × ボタン （2倍サイズ）*/}
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

