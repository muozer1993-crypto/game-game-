// Gizli Sayı — the number variant of Gizli Kelime: 4 digits, all different, "+n −m" feedback.
import { createGame } from './gizli-kelime.js';

export const meta = {
  name: 'Gizli Sayı',
  icon: '🔢',
  description: 'Rakamları farklı 4 haneli sayıyı "+ −" ipuçlarıyla rakibinden önce bul.',
  rules: [
    'Her oyuncu rakibi için rakamları birbirinden farklı, 0 ile başlamayan 4 haneli bir sayı tutar.',
    'Sırayla tahmin edilir. "+" doğru rakam doğru yerde, "−" doğru rakam yanlış yerde demektir. Örnek: gizli 4271, tahmin 4712 → +1 −3.',
    'Önce bulan kazanır; aynı turda bulurlarsa berabere.',
  ].join('\n'),
  data: [],
  settings: [
    { key: 'secretMode', label: 'Gizli sayı', type: 'select', default: 'random', options: [{ value: 'random', label: 'Rastgele' }, { value: 'manual', label: 'Rakip için kendim yazayım' }] },
    { key: 'maxGuesses', label: 'Tahmin hakkı', type: 'select', default: 10, options: [{ value: 8, label: '8' }, { value: 10, label: '10' }, { value: 12, label: '12' }, { value: 0, label: 'Sınırsız' }] },
  ],
};

export default createGame({ kind: 'number', id: 'gizli-sayi', meta });
