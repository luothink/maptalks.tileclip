import { getTileWithMaxZoom } from "./tileget";
//@ts-ignore
import { SphericalMercator } from '@mapbox/sphericalmercator';
// import tileCover from '@mapbox/tile-cover';
import { disposeImage, lnglat2Mercator } from "./util";
import { createImageTypeResult, getBlankTile, getCanvas, getCanvasContext, layoutTiles, resizeCanvas } from "./canvas";
import { bboxOfBBOXList, BBOXtype, pointsToBBOX, bboxToPoints } from "./bbox";
import gcoord from 'gcoord';

const FirstRes = 1.40625, mFirstRes = 156543.03392804097;
const TILESIZE = 256;
const ORIGIN = [-180, 90];
const MORIGIN = [-20037508.342787, 20037508.342787];

const merc = new SphericalMercator({
    size: TILESIZE,
    // antimeridian: true
});

function get4326Res(zoom: number) {
    return FirstRes / Math.pow(2, zoom);
}

function get3857Res(zoom: number) {
    return mFirstRes / Math.pow(2, zoom);
}


function tile4326BBOX(x: number, y: number, z: number): BBOXtype {
    const [orginX, orginY] = ORIGIN;
    const res = get4326Res(z) * TILESIZE;

    let mincol = x;
    let maxcol = x;
    let minrow = y;
    let maxrow = y;
    mincol = Math.floor(mincol);
    maxcol = Math.floor(maxcol);
    minrow = Math.floor(minrow);
    maxrow = Math.floor(maxrow);

    const xmin = orginX + (mincol) * res;
    const xmax = orginX + (mincol + 1) * res;
    const ymin = -orginY + (minrow) * res;
    const ymax = -orginY + (minrow + 1) * res;

    return [xmin, ymin, xmax, ymax];
}


function offsetTileBBOX(bbox: BBOXtype, projection: string, isGCJ02) {
    if (!isGCJ02) {
        return;
    }
    const points = bboxToPoints(bbox);
    const newPoints = points.map(p => {
        if (projection === 'EPSG:3857') {
            const c = gcoord.transform(p as any, gcoord.WebMercator, gcoord.WGS84);
            return c;
        } else {
            return p;
        }
    });
    const transformPoints = newPoints.map(p => {
        return gcoord.transform(p as any, gcoord.WGS84, gcoord.AMap);
    });
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    transformPoints.forEach(p => {
        const [x, y] = p;
        minx = Math.min(minx, x);
        miny = Math.min(miny, y);
        maxx = Math.max(maxx, x);
        maxy = Math.max(maxy, y);
    });
    if (projection === 'EPSG:4326') {
        bbox[0] = minx;
        bbox[1] = miny;
        bbox[2] = maxx;
        bbox[3] = maxy;
    } else {
        const points = bboxToPoints([minx, miny, maxx, maxx]).map(p => {
            return lnglat2Mercator(p) as [number, number];
        });
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        points.forEach(p => {
            const [x, y] = p;
            x1 = Math.min(x1, x);
            y1 = Math.min(y1, y);
            x2 = Math.max(x2, x);
            y2 = Math.max(y2, y);
        });
        bbox[0] = x1;
        bbox[1] = y1;
        bbox[2] = x2;
        bbox[3] = y2;

    }
}
/**
 *  x,y,z is墨卡托
 * @param x 
 * @param y 
 * @param z 
 * @param zoomOffset 
 * @returns 
 */
function cal4326Tiles(x: number, y: number, z: number, zoomOffset = 0, isGCJ02) {
    zoomOffset = zoomOffset || 0;
    const [orginX, orginY] = ORIGIN;
    const res = get4326Res(z) * TILESIZE;
    const tileBBOX = merc.bbox(x, y, z);
    offsetTileBBOX(tileBBOX, 'EPSG:4326', isGCJ02);
    const [minx, miny, maxx, maxy] = tileBBOX;
    let mincol = (minx - orginX) / res, maxcol = (maxx - orginX) / res;
    // const MAXROW = Math.floor(orginY * 2 / res);
    // let minrow = MAXROW - (orginY - miny) / res, maxrow = MAXROW - (orginY - maxy) / res;
    let minrow = (orginY - maxy) / res, maxrow = (orginY - miny) / res;
    mincol = Math.floor(mincol);
    maxcol = Math.floor(maxcol);
    minrow = Math.floor(minrow);
    maxrow = Math.floor(maxrow);
    // console.log(minrow, maxrow, MAXROW);
    if (maxcol < mincol || maxrow < minrow) {
        return;
    }
    const tiles: Array<[number, number, number]> = [];
    for (let row = minrow; row <= maxrow; row++) {
        for (let col = mincol; col <= maxcol; col++) {
            tiles.push([col - 1, row, z + zoomOffset]);
        }
    }

    const xmin = orginX + (mincol - 1) * res;
    const xmax = orginX + (maxcol) * res;
    const ymin = orginY - (maxrow + 1) * res;
    const ymax = orginY - (minrow) * res;

    // console.log(xmin, xmax, ymin, ymax);
    const coordinates: Array<[number, number]> = bboxToPoints(tileBBOX).map(c => {
        return lnglat2Mercator(c) as [number, number];
    })
    return {
        tiles,
        tilesbbox: [xmin, ymin, xmax, ymax],
        bbox: tileBBOX,
        mbbox: pointsToBBOX(coordinates),
        x,
        y,
        z
    };
}

function cal3857Tiles(x: number, y: number, z: number, zoomOffset = 0, isGCJ02) {
    zoomOffset = zoomOffset || 0;
    const [orginX, orginY] = MORIGIN;
    const res = get3857Res(z) * TILESIZE;
    const tileBBOX = tile4326BBOX(x, y, z);
    offsetTileBBOX(tileBBOX, 'EPSG:4326', isGCJ02);
    const mbbox = pointsToBBOX(bboxToPoints(tileBBOX as any).map(c => {
        const result = merc.forward(c);
        return result;
    }));
    const [minx, miny, maxx, maxy] = mbbox;
    let mincol = (minx - orginX) / res, maxcol = (maxx - orginX) / res;
    let minrow = (orginY - maxy) / res, maxrow = (orginY - miny) / res;
    mincol = Math.floor(mincol);
    maxcol = Math.floor(maxcol);
    minrow = Math.floor(minrow);
    maxrow = Math.floor(maxrow);
    if (maxcol < mincol || maxrow < minrow) {
        return;
    }
    const tiles: Array<[number, number, number]> = [];
    for (let row = minrow; row <= maxrow; row++) {
        for (let col = mincol; col <= maxcol; col++) {
            tiles.push([col, row, z + zoomOffset]);
        }
    }
    const bboxList = tiles.map(tile => {
        const [x, y, z] = tile;
        return merc.bbox(x, y, z, false, '900913');
    })
    const [xmin, ymin, xmax, ymax] = bboxOfBBOXList(bboxList);

    return {
        tiles,
        tilesbbox: [xmin, ymin, xmax, ymax],
        bbox: tileBBOX,
        mbbox,
        x,
        y,
        z
    };
}


function tilesImageData(image, tilesbbox, tilebbox, projection) {
    const { width, height } = image;
    const [minx, miny, maxx, maxy] = tilesbbox;
    const ax = (maxx - minx) / width, ay = (maxy - miny) / height;

    let [tminx, tminy, tmaxx, tmaxy] = tilebbox;
    // console.log(tilesbbox, tilebbox);
    //buffer one pixel
    tminx -= ax;
    tmaxx += ax;
    tminy -= ay;
    tmaxy += ay;

    let x1 = (tminx - minx) / ax;
    let y1 = (maxy - tmaxy) / ay;
    let x2 = (tmaxx - minx) / ax;
    let y2 = (maxy - tminy) / ay;
    x1 = Math.floor(x1);
    y1 = Math.floor(y1);
    x2 = Math.ceil(x2);
    y2 = Math.ceil(y2);
    // console.log(x1, x2, y1, y2);
    const w = x2 - x1, h = y2 - y1;
    const tileCanvas = getCanvas();
    resizeCanvas(tileCanvas, w, h);

    const ctx = getCanvasContext(tileCanvas);
    ctx.drawImage(image, x1, y1, w, h, 0, 0, w, h);
    disposeImage(image);

    const imageData = ctx.getImageData(0, 0, w, h).data;
    const pixels = [];
    let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    let index = -1;
    const method = projection === 'EPSG:4326' ? merc.forward : merc.inverse;
    for (let row = 1; row <= h; row++) {
        const y = tmaxy - (row - 1) * ay;
        const y1 = y - ay;
        for (let col = 1; col <= w; col++) {
            const idx = (row - 1) * w * 4 + (col - 1) * 4;
            const r = imageData[idx], g = imageData[idx + 1], b = imageData[idx + 2], a = imageData[idx + 3];
            const x = tminx + (col - 1) * ax;
            const coordinates = [x, y];
            const point = method(coordinates as any);
            xmin = Math.min(xmin, point[0]);
            xmax = Math.max(xmax, point[0]);
            ymin = Math.min(ymin, point[1]);
            ymax = Math.max(ymax, point[1]);
            const coordinates1 = [x, y1];
            pixels[++index] = {
                point,
                point1: method(coordinates1 as any),
                r,
                g,
                b,
                a
            };
        }
    }
    return {
        pixels,
        bbox: [xmin, ymin, xmax, ymax],
        width: w,
        height: h,
        image: tileCanvas.transferToImageBitmap()
        // canvas: tileCanvas
    };
}

function transformTiles(pixelsresult, mbbox, debug) {
    const [xmin, ymin, xmax, ymax] = mbbox;
    const ax = (xmax - xmin) / TILESIZE, ay = (ymax - ymin) / TILESIZE;
    const { pixels, bbox } = pixelsresult;
    const [minx, miny, maxx, maxy] = bbox;
    let width = (maxx - minx) / ax, height = (maxy - miny) / ay;
    width = Math.round(width);
    height = Math.round(height);
    if (isNaN(width) || isNaN(height) || Math.min(width, height) === 0 || Math.abs(width) === Infinity || Math.abs(height) === Infinity) {
        // console.log(width, height, result);
        return;
    }
    const canvas = getCanvas();
    resizeCanvas(canvas, width, height);
    const ctx = getCanvasContext(canvas);

    function transformPixel(x, y) {
        let col = Math.round((x - minx) / ax + 1);
        col = Math.min(col, width);
        let row = Math.round((maxy - y) / ay + 1);
        row = Math.min(row, height);
        return [col, row];
    }

    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;
    for (let i = 0, len = pixels.length; i < len; i++) {
        const { point, point1, r, g, b, a } = pixels[i];
        const [x1, y1] = point;
        const [x2, y2] = point1;
        const [col1, row1] = transformPixel(x1, y1);
        // eslint-disable-next-line no-unused-vars
        const [col2, row2] = transformPixel(x2, y2);
        for (let j = row1; j <= row2; j++) {
            const idx = (j - 1) * width * 4 + (col1 - 1) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = a;
        }
    }
    ctx.putImageData(imageData, 0, 0);
    const image = canvas.transferToImageBitmap();
    const px = Math.round((xmin - minx) / ax);
    const py = Math.round((maxy - ymax) / ay);
    const canvas1 = getCanvas();
    resizeCanvas(canvas1, TILESIZE, TILESIZE);
    const ctx1 = getCanvasContext(canvas);
    ctx1.drawImage(image, px - 1, py, TILESIZE, TILESIZE, 0, 0, TILESIZE, TILESIZE);
    checkBoundaryBlank(ctx1);
    if (debug) {
        ctx1.lineWidth = 0.4;
        ctx1.strokeStyle = 'red';
        ctx1.rect(0, 0, TILESIZE, TILESIZE);
        ctx1.stroke();
    }
    return canvas1.transferToImageBitmap();
}

function checkBoundaryBlank(ctx: OffscreenCanvasRenderingContext2D) {
    const canvas = ctx.canvas;
    const { width, height } = canvas;

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const leftIsBlank = () => {
        for (let row = 1; row <= height; row++) {
            const idx = (width * 4) * (row - 1) + 0;
            const a = data[idx + 3];
            if (a > 0) {
                return false;
            }
        }
        return true;
    }
    const colIsBlank = (col) => {
        for (let row = 1; row <= height; row++) {
            const idx = (width * 4) * (row - 1) + (col - 1) * 4;
            const a = data[idx + 3];
            if (a > 0) {
                return false;
            }
        }
        return true;
    }

    // const topIsBlank = () => {
    //     for (let col = 1; col <= width; col++) {
    //         const idx = (col - 1) * 4;
    //         const a = data[idx + 3];
    //         if (a > 0) {
    //             return false;
    //         }
    //     }
    //     return true;
    // }

    const bottomIsBlank = () => {
        for (let col = 1; col <= width; col++) {
            const idx = (col - 1) * 4 + (height - 1) * width * 4;
            const a = data[idx + 3];
            if (a > 0) {
                return false;
            }
        }
        return true;
    }
    if (leftIsBlank()) {
        for (let row = 1; row <= height; row++) {
            const idx1 = (width * 4) * (row - 1) + 0;
            const idx2 = idx1 + 4;
            const r = data[idx2];
            const g = data[idx2 + 1];
            const b = data[idx2 + 2];
            const a = data[idx2 + 3];

            data[idx1] = r;
            data[idx1 + 1] = g;
            data[idx1 + 2] = b;
            data[idx1 + 3] = a;
        }
    }
    if (bottomIsBlank()) {
        for (let col = 1; col <= width; col++) {
            const idx1 = (col - 1) * 4 + (height - 1) * width * 4;
            const idx2 = (col - 1) * 4 + (height - 2) * width * 4;
            const r = data[idx2];
            const g = data[idx2 + 1];
            const b = data[idx2 + 2];
            const a = data[idx2 + 3];

            data[idx1] = r;
            data[idx1 + 1] = g;
            data[idx1 + 2] = b;
            data[idx1 + 3] = a;
        }
    }
    // if (topIsBlank()) {
    //     console.log(true);
    //     for (let col = 1; col <= width; col++) {
    //         const idx1 = (col - 1) * 4;
    //         const idx2 = (col - 1) * 4 + width * 4;
    //         const r = data[idx2];
    //         const g = data[idx2 + 1];
    //         const b = data[idx2 + 2];
    //         const a = data[idx2 + 3];

    //         data[idx1] = r;
    //         data[idx1 + 1] = g;
    //         data[idx1 + 2] = b;
    //         data[idx1 + 3] = a;
    //     }
    // }
    const colBlanks = [];
    for (let col = 1, len = width; col <= len; col++) {
        colBlanks.push(colIsBlank(col));
    }
    const hasColBlank = colBlanks.indexOf(true) > -1;
    if (hasColBlank) {
        const fixCol = (col1, col2) => {
            for (let row = 1; row <= height; row++) {
                const idx1 = (width * 4) * (row - 1) + (col1 - 1) * 4;
                const idx2 = (width * 4) * (row - 1) + (col2 - 1) * 4;
                const r = data[idx2];
                const g = data[idx2 + 1];
                const b = data[idx2 + 2];
                const a = data[idx2 + 3];

                data[idx1] = r;
                data[idx1 + 1] = g;
                data[idx1 + 2] = b;
                data[idx1 + 3] = a;
            }
        }
        for (let col = 1; col <= width; col++) {
            const current = colBlanks[col - 1];
            if (!current) {
                continue;
            }
            const next = colBlanks[col];
            const pre = colBlanks[col - 1];
            if (!next) {
                fixCol(col, col + 1);
            } else if (!pre) {
                fixCol(col, col - 1);
            }
        }
    }
    ctx.putImageData(imageData, 0, 0);
}




export function tileTransform(options) {
    return new Promise((resolve, reject) => {
        const { x, y, z, projection, zoomOffset, errorLog, debug, isGCJ02 } = options;
        const returnImage = (opImage) => {
            createImageTypeResult(getCanvas(), opImage, options).then(url => {
                resolve(url);
            }).catch(error => {
                reject(error);
            })
        }

        const loadTiles = () => {
            let result;
            if (projection === 'EPSG:4326') {
                result = cal4326Tiles(x, y, z, zoomOffset || 0, isGCJ02);

            } else if (projection === 'EPSG:3857') {
                result = cal3857Tiles(x, y, z, zoomOffset || 0, isGCJ02);
            }
            // console.log(result);
            const { tiles } = result || {};
            if (!tiles || tiles.length === 0) {
                returnImage(getBlankTile());
                return;
            }
            result.loadCount = 0;
            const loadTile = () => {
                if (result.loadCount >= tiles.length) {
                    const image = layoutTiles(tiles, debug);
                    let image1;
                    if (projection === 'EPSG:4326') {
                        const imageData = tilesImageData(image, result.tilesbbox, result.bbox, projection);
                        image1 = transformTiles(imageData, result.mbbox, debug);
                        returnImage(image1 || getBlankTile());
                    } else {
                        const imageData = tilesImageData(image, result.tilesbbox, result.mbbox, projection);
                        image1 = transformTiles(imageData, result.bbox, debug);
                        returnImage(image1 || getBlankTile());
                    }
                } else {
                    const tile = tiles[result.loadCount];
                    const [x, y, z] = tile;
                    getTileWithMaxZoom(Object.assign({}, options, { x, y, z, returnBlobURL: false })).then(image => {
                        tile.tileImage = image;
                        result.loadCount++;
                        loadTile();
                    }).catch(error => {
                        if (errorLog) {
                            console.error(error);
                        }
                        tile.tileImage = getBlankTile();;
                        result.loadCount++;
                        loadTile();
                    });
                }
            }
            loadTile();
        }
        loadTiles();

    })
}