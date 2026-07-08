import { createTLStore, defaultShapeUtils } from '@tldraw/tldraw';
const store = createTLStore({ shapeUtils: defaultShapeUtils });
console.log(JSON.stringify(store.serialize(), null, 2));
