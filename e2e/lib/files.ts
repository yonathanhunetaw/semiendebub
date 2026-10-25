/** Files the upload specs hand to an <input type="file"> (setInputFiles or a file chooser). */

/** The smallest valid PNG: one transparent pixel. */
const ONE_PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

export const pngFile = (name = 'picture.png') => ({ name, mimeType: 'image/png', buffer: ONE_PIXEL });

export const csvFile = (name: string, text: string) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text, 'utf8') });
