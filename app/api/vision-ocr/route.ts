import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const image = body.image; // base64データ（プレフィックスなし）

  // Google認証クライアントの作成
  const client = new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  // Vision API クライアントの初期化
  const vision = google.vision({
    version: 'v1',
    auth: client,
  });

  // annotate API の呼び出し（TEXT_DETECTION）
  const result = await vision.images.annotate({
    requestBody: {
      requests: [
        {
          image: { content: image },
          features: [{ type: 'TEXT_DETECTION' }],
        },
      ],
    },
  });

  // 結果をそのまま返す（textAnnotations に文字と位置情報が入っている）
  return NextResponse.json(result.data);
}
