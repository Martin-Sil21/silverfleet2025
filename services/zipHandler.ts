/**
 * 📦 ZIP Handler Service
 * 
 * Permite descomprimir archivos ZIP en el navegador usando JSZip
 * Extrae todos los archivos de una carpeta comprimida
 */

import JSZip from 'jszip';

interface ExtractedFile {
  path: string;
  name: string;
  content: string | ArrayBuffer;
  isText: boolean;
}

/**
 * Detecta si un archivo es ZIP
 */
export const isZipFile = (file: File): boolean => {
  return file.name.endsWith('.zip') || file.type === 'application/zip';
};

/**
 * Extrae archivos de un ZIP
 * Requiere que JSZip esté disponible
 */
export const extractZipFile = async (zipFile: File): Promise<ExtractedFile[]> => {
  const extractedFiles: ExtractedFile[] = [];

  try {
    // Leer el archivo ZIP como ArrayBuffer
    const arrayBuffer = await zipFile.arrayBuffer();
    const zip = new JSZip();
    await zip.loadAsync(arrayBuffer);

    // Iterar sobre todos los archivos en el ZIP
    zip.forEach((relativePath: string, file: any) => {
      // Ignorar directorios y archivos del sistema
      if (file.dir || relativePath.startsWith('.') || relativePath.includes('/.')) {
        return;
      }

      // Ignorar node_modules, dist, build, etc.
      const blacklistPatterns = [
        'node_modules/',
        'dist/',
        'build/',
        '.git/',
        '.vscode/',
        '__pycache__/',
        '.pytest_cache/',
        '/.env',
        '.zip',
        '.exe',
        '.dll',
        '.so',
        '.dylib',
      ];

      if (blacklistPatterns.some(pattern => relativePath.toLowerCase().includes(pattern))) {
        return;
      }

      // Determinar si es archivo de texto
      const isText = isTextFile(relativePath);

      // Agregar a la lista de extracción
      extractedFiles.push({
        path: relativePath,
        name: relativePath.split('/').pop() || relativePath,
        content: isText ? file.async('text') : file.async('arraybuffer'),
        isText,
      });
    });

    // Resolver todos los contenidos de archivos en paralelo
    const resolvedFiles = await Promise.all(
      extractedFiles.map(async (file) => ({
        ...file,
        content: await file.content,
      }))
    );

    console.log(`✅ ZIP extraído: ${resolvedFiles.length} archivos`);
    return resolvedFiles;
  } catch (error: any) {
    throw new Error(`Failed to extract ZIP file: ${error.message}`);
  }
};

/**
 * Detecta si un archivo es texto basado en su extensión
 */
const isTextFile = (filePath: string): boolean => {
  const textExtensions = [
    '.ts', '.tsx', '.js', '.jsx',
    '.json', '.yml', '.yaml',
    '.md', '.txt', '.html', '.css', '.scss',
    '.py', '.java', '.go', '.rs',
    '.sql', '.graphql',
    '.env', '.properties',
  ];

  const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
  return textExtensions.includes(ext);
};

/**
 * Convierte archivos extraídos del ZIP a objetos File
 * Para compatibilidad con el parser existente
 */
export const convertExtractedToFiles = (extractedFiles: ExtractedFile[]): File[] => {
  return extractedFiles
    .filter(f => f.isText && f.name !== '.DS_Store')
    .map(f => {
      const blob = new Blob([f.content as string], { type: 'text/plain' });
      return new File([blob], f.name, { type: 'text/plain' });
    });
};

/**
 * Extrae y convierte ZIP a archivos parseables
 */
export const processZipFile = async (zipFile: File): Promise<File[]> => {
  const extractedFiles = await extractZipFile(zipFile);
  return convertExtractedToFiles(extractedFiles);
};
