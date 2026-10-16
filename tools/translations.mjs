import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import gettext from 'gettext-parser';
const catalog = gettext.po.parse(readFileSync(new URL('../po/it.po', import.meta.url)), {validation: true});
const destination = new URL('../extension/locale/it/LC_MESSAGES/', import.meta.url);
mkdirSync(destination, {recursive: true});
writeFileSync(new URL('cello.mo', destination), gettext.mo.compile(catalog));
