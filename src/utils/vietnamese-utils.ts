/**
 * Loại bỏ dấu tiếng Việt từ chuỗi
 * @param str - Chuỗi cần loại bỏ dấu
 * @returns Chuỗi đã loại bỏ dấu (lowercase)
 */
export function removeVietnameseTones(str: string): string {
  if (!str) return ''
  
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

/**
 * Tạo regex pattern để search cả có dấu và không dấu
 * @param searchText - Text cần search
 * @returns Regex pattern
 */
export function createVietnameseSearchRegex(searchText: string): RegExp {
  if (!searchText) return /.*/
  
  // Loại bỏ dấu từ search text và chuyển về lowercase
  const normalizedSearch = removeVietnameseTones(searchText)
  
  // Map các ký tự có thể có dấu (case-insensitive)
  const charMap: Record<string, string> = {
    'a': '[aàáảãạăằắẳẵặâầấẩẫậAÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬ]',
    'e': '[eèéẻẽẹêềếểễệEÈÉẺẼẸÊỀẾỂỄỆ]',
    'i': '[iìíỉĩịIÌÍỈĨỊ]',
    'o': '[oòóỏõọôồốổỗộơờớởỡợOÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢ]',
    'u': '[uùúủũụưừứửữựUÙÚỦŨỤƯỪỨỬỮỰ]',
    'y': '[yỳýỷỹỵYỲÝỶỸỴ]',
    'd': '[dđDĐ]'
  }
  
  // Tạo pattern: tìm cả có dấu và không dấu
  // Ví dụ: "bang" sẽ match "bằng", "bang", "Bằng", "Bang"
  const pattern = normalizedSearch
    .split('')
    .map(char => {
      // Nếu là ký tự có thể có dấu, trả về pattern
      if (charMap[char]) {
        return charMap[char]
      }
      
      // Nếu không, escape ký tự đặc biệt và giữ nguyên (case-insensitive)
      const escaped = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return `[${escaped}${escaped.toUpperCase()}]`
    })
    .join('')
  
  return new RegExp(pattern, 'i')
}

