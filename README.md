# CertX API - Backend cho hệ thống quản lý & xác thực văn bằng trên Blockchain

Backend Node.js + Express + TypeScript + Mongoose cho hệ thống quản lý và xác thực văn bằng - chứng chỉ sử dụng công nghệ chuỗi khối (Blockchain Certificate Registry).

## 🚀 Tính năng

- **Authentication**: JWT-based login cho issuer
- **Issue Certificate**: Cấp phát chứng chỉ trên blockchain
- **Revoke Certificate**: Thu hồi chứng chỉ
- **Verify Certificate**: Xác thực chứng chỉ qua hash
- **QR Code Generation**: Tạo QR code cho liên kết xác thực
- **File Upload**: Hỗ trợ upload file PDF, JPG, PNG
- **IPFS Integration**: (Tùy chọn) Lưu trữ metadata trên IPFS
- **Watermark**: Chèn watermark vào chứng chỉ trước khi phát hành

## 📁 Cấu trúc dự án

```
certx-api/
├─ src/
│  ├─ index.ts                 # Bootstrap: env, db, server listen
│  ├─ app.ts                   # Init express, middlewares, routes
│  ├─ routes/
│  │  ├─ auth.routes.ts        # POST /auth/login
│  │  └─ certs.routes.ts       # POST /certs/issue, /certs/revoke, GET /verify, /qrcode
│  ├─ controllers/
│  │  ├─ auth.controller.ts    # Xử lý authentication
│  │  └─ certs.controller.ts   # Xử lý chứng chỉ
│  ├─ services/
│  │  ├─ blockchain.service.ts # Ethers: issue/revoke/get
│  │  ├─ ipfs.service.ts       # (Tùy chọn) Upload JSON → IPFS
│  │  ├─ hash.service.ts       # Chuẩn hoá file, SHA-256
│  │  ├─ qrcode.service.ts     # Tạo PNG QR (data URL)
│  │  └─ watermark.service.ts  # Chèn watermark vào PDF/ảnh
│  ├─ models/
│  │  ├─ issuer.model.ts       # Tài khoản issuer
│  │  └─ cert.model.ts         # Log off-chain (hash, metadataUri, status)
│  ├─ middlewares/
│  │  ├─ auth.ts               # Verify JWT cho issuer
│  │  └─ upload.ts             # Multer cấu hình upload file
│  ├─ config/
│  │  ├─ db.ts                 # Kết nối MongoDB
│  │  └─ logger.ts             # Console wrapper
│  ├─ utils/
│  │  ├─ env.ts                # Load/validate ENV
│  │  └─ errors.ts             # Helper HTTP errors
│  ├─ abi/
│  │  └─ CertificateRegistry.json  # ABI copy từ contracts build
│  └─ types/
│      └─ global.d.ts          # TypeScript global types
├─ .env.example                # Environment variables template
├─ nodemon.json                # Nodemon config
├─ tsconfig.json               # TypeScript config
├─ package.json                # Dependencies
└─ README.md                   # Documentation
```

## 🛠️ Công nghệ sử dụng

- **Node.js** - Runtime
- **Express** - Web framework
- **TypeScript** - Type safety
- **Mongoose** - MongoDB ODM
- **Ethers.js** - Blockchain interaction
- **JWT** - Authentication
- **Multer** - File upload
- **QRCode** - QR code generation
- **bcryptjs** - Password hashing
- **sharp** - Image processing & watermarking
- **pdf-lib** - PDF watermarking
- **file-type** - File type detection

## 📋 Yêu cầu hệ thống

- Node.js >= 16.0.0
- npm >= 8.0.0
- MongoDB >= 4.0.0
- Ethereum node (Sepolia testnet)

## 🚀 Cách chạy dự án

### 1. Cài đặt dependencies

```bash
npm install
```

### 2. Cấu hình environment

```bash
cp .env.example .env
```

Chỉnh sửa file `.env`:
```env
PORT=8080
MONGO_URI=mongodb://localhost:27017/certx
JWT_SECRET=supersecret

CHAIN_RPC_URL=https://sepolia.infura.io/v3/xxx
CONTRACT_ADDRESS=0xYourContract
CONTRACT_CHAIN_ID=11155111
PRIVATE_KEY=0xYourIssuerPrivateKey

IPFS_TOKEN=
PUBLIC_VERIFY_BASE=http://localhost:5173/verify

# Watermark configuration (optional)
WATERMARK_ENABLED=true
WATERMARK_TEXT=Issued by CertX • Do not alter
WATERMARK_OPACITY=0.2
WATERMARK_COLOR=#bfbfbf
WATERMARK_REPEAT=3
WATERMARK_MARGIN=0.12
WATERMARK_FONT_PATH=./fonts/NotoSans-Regular.ttf
```

### 3. Chạy development server

```bash
npm run dev
```

API sẽ chạy tại: `http://localhost:8080`

### 4. Build production

```bash
npm run build
```

### 5. Chạy production

```bash
npm start
```

## 🔄 API Endpoints

### Authentication
- `POST /auth/login` - Đăng nhập issuer

### Certificates
- `POST /certs/issue` - Cấp phát chứng chỉ (cần auth)
- `GET /certs` - Danh sách chứng chỉ do issuer hiện tại phát hành
- `POST /certs/revoke` - Thu hồi chứng chỉ (cần auth, kiểm tra issuer)
- `GET /verify?hash=...` - Xác thực chứng chỉ
- `GET /qrcode?hash=...` - Tạo QR code PNG

### Health Check
- `GET /health` - Kiểm tra trạng thái server

## 🔗 Blockchain Integration

### Smart Contract Methods
- `issue(bytes32 docHash, string metadataUri)` - Cấp phát chứng chỉ
- `revoke(bytes32 docHash)` - Thu hồi chứng chỉ
- `get(bytes32 docHash)` - Lấy thông tin chứng chỉ

### Certificate Status
- `0` - NOT_FOUND
- `1` - VALID
- `2` - REVOKED

## 📊 Database Schema

### Issuer Model
```typescript
{
  email: string (unique)
  passwordHash: string
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}
```

### Cert Model
```typescript
{
  docHash: string (indexed)
  metadataUri: string
  holderName: string
  degree: string
  issuedDate: string
  issuerName: string
  status: 'VALID' | 'REVOKED'
  createdAt: Date
  updatedAt: Date
}
```

## 🔧 Development

### Scripts có sẵn

- `npm run dev` - Chạy development server với nodemon
- `npm run build` - Build TypeScript
- `npm start` - Chạy production build

### Cấu trúc code

- **Controllers**: Xử lý business logic
- **Services**: Tương tác với external services (blockchain, IPFS)
- **Models**: MongoDB schemas
- **Middlewares**: Authentication, file upload
- **Routes**: API route definitions
- **Utils**: Helper functions

## 🔐 Security

- JWT authentication cho issuer endpoints
- Password hashing với bcryptjs
- File upload validation (size, type)
- CORS enabled
- Environment variables validation

## 💧 Watermark Feature

### Tổng quan
Hệ thống hỗ trợ chèn watermark vào chứng chỉ (PDF, JPG, PNG) trước khi phát hành. Watermark giúp:
- Bảo vệ bản quyền
- Chống chỉnh sửa (visual deterrence)
- Xác thực nguồn gốc

### Cấu hình
Các biến môi trường trong `.env`:

```env
WATERMARK_ENABLED=true              # Bật/tắt watermark
WATERMARK_TEXT=Issued by CertX      # Text watermark
WATERMARK_OPACITY=0.2               # Độ mờ (0-1)
WATERMARK_COLOR=#bfbfbf             # Màu chữ watermark
WATERMARK_REPEAT=3                  # Số dòng watermark mỗi trang (1-6)
WATERMARK_MARGIN=0.12               # Biên trên/dưới (0-0.45)
```
- `WATERMARK_REPEAT`: số lần lặp watermark trên mỗi trang (ví dụ 3 cho cân bằng, tăng/giảm để chỉnh khoảng cách).
- `WATERMARK_MARGIN`: tỉ lệ khoảng cách đỉnh/cuối trang (0-0.45). Mặc định 0.12 giúp watermark bắt đầu gần mép trên.
- `WATERMARK_FONT_PATH`: (tùy chọn) đường dẫn tới file .ttf hỗ trợ Unicode để giữ nguyên dấu tiếng Việt trong watermark.


### Cách hoạt động

#### 1. PDF Watermark
- Chèn text dạng chéo qua mỗi trang
- Font: Helvetica, màu xám, độ mờ 0.15
- Kích thước font tỉ lệ với trang

#### 2. Image Watermark (JPG/PNG)
- Sử dụng SVG overlay với sharp
- Text xoay 30 độ ở giữa ảnh
- Độ mờ có thể điều chỉnh

#### 3. Luồng xử lý
```
1. Upload file gốc
2. Chèn watermark (nếu bật)
3. Tính SHA-256 từ bản ĐÃ watermark
4. Upload metadata lên IPFS
5. Ghi hash lên blockchain
6. Lưu vào MongoDB
```

**Lưu ý**: Hash được tính từ bản ĐÃ watermark (phiên bản phát hành). Bản gốc không được lưu.

### Kiểm thử

```bash
# Test với ảnh
curl -X POST http://localhost:8080/certs/issue \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@cert.jpg" \
  -F "holderName=Nguyen Van A" \
  -F "degree=BSc" \
  -F "issuedDate=2024-01-15"

# Test với PDF
curl -X POST http://localhost:8080/certs/issue \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@cert.pdf" \
  -F "holderName=Nguyen Van A" \
  -F "degree=BSc" \
  -F "issuedDate=2024-01-15"
```

Watermark text sẽ tự động bao gồm: `WATERMARK_TEXT • holderName • issuedDate`

## 📄 License

MIT License

## 🌱 Seed dữ liệu

Tạo nhanh một issuer mẫu:

```bash
pnpm run seed
```

Có thể ghi đè thông tin qua env:

```env
SEED_ISSUER_EMAIL=issuer@certx.local
SEED_ISSUER_PASSWORD=Certx123!
SEED_ISSUER_NAME=CertX Academy
SEED_ISSUER_ADDRESS=0xSeedIssuerAddress...
```
