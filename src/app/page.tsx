import { redirect } from 'next/navigation';

/**
 * ルートページ - character-move-1on1にリダイレクト
 */
export default function Home() {
  redirect('/character-move-1on1');
}
