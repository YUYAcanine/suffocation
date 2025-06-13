'use client';

import { useState, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import Image from 'next/image';

type Vertex = { x: number; y: number; };

type BoundingBox = {
  description: string;
  boundingPoly: { vertices: Vertex[] };
};

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<BoundingBox[]>([]);
  const [selectedText, setSelectedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [menuDescriptions, setMenuDescriptions] = useState<Record<string, string>>({});
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    fetch('/menu_descriptions.csv')
      .then((res) => res.text())
      .then((csv) => {
        const parsed = Papa.parse(csv, { header: true });
        const map: Record<string, string> = {};
        (parsed.data as { name: string; description: string }[]).forEach(row => {
          if (row.name && row.description) {
            map[row.name.trim()] = row.description.trim();
          }
        });
        setMenuDescriptions(map);
      });
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Image = reader.result as string;
      setImage(base64Image);
      setLoading(true);

      const res = await fetch('/api/vision-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image.split(',')[1] }),
      });

      const result = await res.json();
      const annotations = result.responses?.[0]?.textAnnotations || [];

      const parsedBoxes: BoundingBox[] = annotations.slice(1).map((ann: any) => ({
        description: ann.description,
        boundingPoly: {
          vertices: ann.boundingPoly.vertices.map((v: any) => ({
            x: v.x ?? 0, y: v.y ?? 0,
          }))
        }
      }));

      setBoxes(parsedBoxes);
      setLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const getBoxStyle = (box: BoundingBox) => {
    if (!imageRef.current) return {};
    const img = imageRef.current;
    const scaleX = img.clientWidth / img.naturalWidth;
    const scaleY = img.clientHeight / img.naturalHeight;
    const [v0, v1, v2] = box.boundingPoly.vertices;

    return {
      position: 'absolute' as const,
      left: v0.x * scaleX,
      top: v0.y * scaleY,
      width: (v1.x - v0.x) * scaleX,
      height: (v2.y - v1.y) * scaleY,
      border: '1px solid red',
      backgroundColor: 'rgba(255,255,255,0.3)',
      cursor: 'pointer',
    };
  };

  return (
    <main className="p-4">
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
            style={{ maxWidth: '100%', height: 'auto' }}
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

      {loading && <p>OCR処理中...</p>}

      {selectedText && (
        <div className="fixed bottom-0 left-0 right-0 bg-white p-6 shadow-xl z-10 text-lg">
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
