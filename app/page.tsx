'use client';

import { useState, useRef } from 'react';

// 料理名に対応する説明マップ
const menuDescriptions: Record<string, string> = {
  'ソーセージ': '二つに切って食べる',
  '食パン': '水につけて食べる',
  'ラーメン': 'スープから飲む',
  'おにぎり': 'お皿に置く',
  // 他の料理もここに追加
};

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<any[]>([]);
  const [selectedText, setSelectedText] = useState('');
  const [loading, setLoading] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Image = reader.result as string;
      setImage(base64Image);
      setLoading(true);

      const base64 = base64Image.split(',')[1];
      const res = await fetch('/api/vision-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      });

      const result = await res.json();
      const annotations = result.responses?.[0]?.textAnnotations || [];
      setBoxes(annotations.slice(1));
      setLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const getBoxStyle = (box: any) => {
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
          <img
            src={image}
            ref={imageRef}
            alt="uploaded"
            className="max-w-full"
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
