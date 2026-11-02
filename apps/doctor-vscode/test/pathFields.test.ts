import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { dialogStartFor, PATH_FIELDS, valueForPickedPath } from '../src/config/pathFields';

const project = path.join('/work', 'site');
const context = {
  projectFolder: project,
  contentFolder: path.join(project, 'src'),
  partialsFolder: path.join(project, 'partials'),
};
const p = (...parts: string[]) => path.join(project, ...parts);
const pick = (field: string, picked: string) => {
  const result = valueForPickedPath(PATH_FIELDS[field], picked, context);
  return 'value' in result ? result.value : `ERROR: ${result.error}`;
};

describe('a picked path, written the way doctor reads it', () => {
  it('writes most settings relative to doctor.json, in the ./ shape', () => {
    expect(pick('folder', p('src'))).toBe('./src');
    expect(pick('markdown.shortcodesFolder', p('tools', 'shortcodes'))).toBe('./tools/shortcodes');
    expect(pick('certificate', p('certs', 'app.pfx'))).toBe('./certs/app.pfx');
  });

  it('writes the doctor.json folder itself as .', () => {
    expect(pick('folder', project)).toBe('.');
  });

  it('writes the logo from the content folder when it lives there, since doctor looks there first', () => {
    expect(pick('siteDesign.logo', p('src', 'assets', 'logo.png'))).toBe('assets/logo.png');
  });

  it('writes a logo outside the content folder relative to doctor.json', () => {
    expect(pick('siteDesign.logo', p('branding', 'logo.png'))).toBe('./branding/logo.png');
  });

  it('writes a partial in partials.folder as a bare name, which doctor looks up there', () => {
    expect(pick('partials.header', p('partials', 'header.md'))).toBe('header.md');
    expect(pick('partials.footer', p('partials', 'site', 'footer.md'))).toBe('site/footer.md');
  });

  it('writes a partial outside partials.folder relative to doctor.json, where doctor loads it from', () => {
    // The automatic header and footer are loaded from the folder doctor runs
    // in — not each page's folder, as an <include> is
    expect(pick('partials.header', p('src', 'shared', 'header.md'))).toBe('./src/shared/header.md');
    expect(pick('partials.footer', path.join('/work', 'common', 'footer.md'))).toBe('../common/footer.md');
  });

  it('writes a folder beside the project as ../, which stays portable', () => {
    expect(pick('folder', path.join('/work', 'shared-docs'))).toBe('../shared-docs');
  });

  it('writes a certificate kept outside the project as the absolute path it is', () => {
    // Keeping the .pfx out of the repository is the usual reason it is there,
    // so it is a path on this machine by design
    expect(pick('certificate', path.join('/Users', 'me', '.certs', 'app.pfx'))).toBe('/Users/me/.certs/app.pfx');
  });

  it('writes forward slashes whatever the OS, because doctor.json is shared', () => {
    expect(pick('folder', p('docs', 'content'))).not.toContain('\\');
  });
});

describe('what gets a picker', () => {
  it('leaves out the settings that are SharePoint paths, not paths on disk', () => {
    // stateFile and library live in the asset library
    expect(PATH_FIELDS.stateFile).toBeUndefined();
    expect(PATH_FIELDS.library).toBeUndefined();
  });

  it('offers only certificate files for the certificate', () => {
    expect(PATH_FIELDS.certificate.extensions).toEqual(['pfx', 'p12', 'pem']);
  });
});

describe('where the dialog opens', () => {
  it('opens at the current value', () => {
    expect(dialogStartFor(PATH_FIELDS.folder, './src', context)).toBe(p('src'));
  });

  it('opens a partial at partials.folder', () => {
    expect(dialogStartFor(PATH_FIELDS['partials.header'], 'header.md', context)).toBe(p('partials', 'header.md'));
  });

  it('opens at the base when nothing is set', () => {
    expect(dialogStartFor(PATH_FIELDS.certificate, undefined, context)).toBe(project);
  });
});
