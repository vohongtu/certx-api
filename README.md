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
│  │  └─ qrcode.service.ts     # Tạo PNG QR (data URL)
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
- `POST /certs/revoke` - Thu hồi chứng chỉ (cần auth)
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

## 📄 License

MIT License
