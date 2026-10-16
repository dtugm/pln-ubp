# WebGIS PLN TambakLorok — Prototype

Starter project: Next.js + TypeScript + Tailwind CSS + MapLibre GL JS.

## Prasyarat
- Node.js 20.9 atau lebih baru
- npm

## Menjalankan
```bash
npm install
npm run dev
```
Buka http://localhost:3000.

## Yang sudah ada
- Halaman login demo di tengah.
- Dashboard responsif dengan MapLibre.
- Layer demo jaringan TM/TR, gardu, tiang, dan batas area.
- Popup contoh aset, kontrol zoom/rotasi, pencarian demo.
- Tombol Terrain 3D yang menunggu sumber elevation tiles.

## Penting
- Login **belum aman dan belum terhubung ke autentikasi**. Form menerima input apa pun dan hanya untuk demonstrasi.
- Garis, titik, statistik, serta batas area adalah data ilustrasi, bukan data operasional PLN.
- Basemap menggunakan tile OpenStreetMap. Untuk deployment, patuhi kebijakan penggunaan tile provider atau gunakan penyedia basemap sendiri.
- DTM GeoTIFF tidak bisa langsung dipakai sebagai `raster-dem` hanya dengan mengganti URL. Siapkan DEM/DTM sebagai elevation tiles kompatibel MapLibre, kemudian isi `NEXT_PUBLIC_TERRAIN_TILEJSON_URL` di `.env.local`.
- Jangan memasukkan kredensial atau data internal PLN ke file contoh. Terapkan autentikasi, otorisasi, HTTPS, dan pembatasan akses sebelum penggunaan nyata.

## Langkah berikutnya
1. Ganti data GeoJSON demo dengan data resmi yang sudah disetujui untuk digunakan.
2. Tentukan sumber data: PostGIS + backend API, atau GeoServer.
3. Siapkan tile elevasi untuk terrain 3D.
4. Bangun autentikasi server-side dan role pengguna.
