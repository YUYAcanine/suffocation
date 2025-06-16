'use client';

import { useState, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import Image from 'next/image';
import imageCompression from 'browser-image-compression';

type Vertex = {
  x: number;
  y: number;
};

type BoundingBox = {
  description: string;
  boundingPoly: {
    vertices: Vertex[];
  };
};

type ParsedRow = {
  name: string;
  description: string;
};

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<BoundingBox[]>([]);
  const [selectedText, setSelectedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [menuDescriptions, setMenuDescriptions] = useState<Record<string, string>>({});
  const imageRef = useRef<HTMLImageElement>(null);

  // CSVの読み込み
  useEffect(() => {
    fetch('/menu_descriptions.csv')
      .then(res => res.text())
      .then(text => {
        Papa.parse(text, {
          header: true,
          complete: (result) => {
            const data = result.data as ParsedRow[];
            const map: Record<string, string> = {};
            data.forEach(row => {
              if (row.name && row.description) {
                map[row.name.trim()] = row.description.trim();
              }
            });
            setMenuDescriptions(map);
          }
        });
      });
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);

    try {
      // 画像を圧縮（例：最大1MB, 幅最大1024px）
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1024,
        useWebWorker: true,
      });

      const reader = new FileReader();
      reader.onload = async () => {
        const base64Image = reader.result as string;
        setImage(base64Image);

        const base64 = base64Image.split(',')[1];
        const res = await fetch('/api/vision-ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64 }),
        });

        const result = await res.json();
        const annotations = result.responses?.[0]?.textAnnotations || [];

        const parsedBoxes: BoundingBox[] = annotations.slice(1).map((ann: unknown) => {
          const a = ann as BoundingBox;
          return {
            description: a.description,
            boundingPoly: {
              vertices: a.boundingPoly.vertices.map((v: Partial<Vertex>) => ({
                x: v.x ?? 0,
                y: v.y ?? 0,
              })),
            },
          };
        });

        setBoxes(parsedBoxes);
      };

      reader.readAsDataURL(compressedFile);
    } catch (error) {
      console.error('画像圧縮エラー:', error);
      alert('画像の処理中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
};

  const getBoxStyle = (box: BoundingBox) => {
    if (!imageRef.current) return {};
    const img = imageRef.current;
    const scaleX = img.clientWidth / img.naturalWidth;
    const scaleY = img.clientHeight / img.naturalHeight;

    const vertices = box.boundingPoly.vertices;
    const left = vertices[0].x * scaleX;
    const top = vertices[0].y * scaleY;
    const width = (vertices[1].x - vertices[0].x) * scaleX;
    const height = (vertices[2].y - vertices[1].y) * scaleY;

    return {
      position: 'absolute' as const,
      left,
      top,
      width,
      height,
      border: '1px solid red',
      backgroundColor: 'rgba(255,255,255,0.3)',
      cursor: 'pointer',
    };
  };

  return (
    <main className="p-4 text-white">
      <h1 className="text-xl font-bold mb-4">Google Vision OCR メニューアプリ</h1>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleImageUpload}
        className="mb-4"
      />

      <div className="relative inline-block">
        {image && (
          <Image
            src={image}
            alt="uploaded"
            ref={imageRef}
            width={500}
            height={500}
            className="max-w-full h-auto"
          />
        )}

        {boxes.map((box, idx) => (
          <div
            key={idx}
            style={getBoxStyle(box)}
            onClick={() => setSelectedText(box.description)}
            title={box.description}
          />
        ))}
      </div>

      {loading && <p className="text-white">OCR処理中...</p>}

      {selectedText && (
        <div className="fixed bottom-0 left-0 right-0 bg-white p-20 shadow-xl z-10 text-lg text-black">
          <h2 className="font-bold mb-2">選択された料理：</h2>
          <p className="mb-2">{selectedText}</p>
          <h2 className="font-bold">説明：</h2>
          <p className="text-gray-700">
            {menuDescriptions[selectedText] || '説明は見つかりませんでした'}
          </p>
        </div>
      )}
    </main>
  );
}
