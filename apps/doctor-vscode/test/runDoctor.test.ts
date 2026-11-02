import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  CERTIFICATE_PASSWORD_ENV,
  DOCTOR_RUNS,
  passwordToHandOver,
  resolveDoctorExecutable,
} from '../src/commands/runDoctor';

const project = path.join('/work', 'docs-site');
const localBin = (platform: NodeJS.Platform) =>
  path.join(project, 'node_modules', '.bin', platform === 'win32' ? 'doctor.cmd' : 'doctor');

describe('which doctor runs', () => {
  it('uses the global doctor the docs tell people to install', () => {
    expect(resolveDoctorExecutable(project, undefined, () => false, 'darwin')).toBe('doctor');
  });

  it('prefers a doctor the project installed, so its pinned version runs', () => {
    const exists = (file: string) => file === localBin('darwin');
    expect(resolveDoctorExecutable(project, undefined, exists, 'darwin')).toBe(localBin('darwin'));
  });

  it('looks for the .cmd shim on Windows', () => {
    const exists = (file: string) => file === localBin('win32');
    expect(resolveDoctorExecutable(project, undefined, exists, 'win32')).toBe(localBin('win32'));
  });

  it('lets the setting win over both', () => {
    const exists = () => true;
    expect(resolveDoctorExecutable(project, '/src/doctor/bin/doctor', exists, 'darwin')).toBe(
      '/src/doctor/bin/doctor'
    );
  });

  it('treats a blank setting as not set', () => {
    expect(resolveDoctorExecutable(project, '   ', () => false, 'darwin')).toBe('doctor');
  });

  it('never falls back to npx', () => {
    // A bare `npx doctor` without a local install resolves against the npm
    // registry, where `doctor` is an unrelated package
    for (const platform of ['darwin', 'linux', 'win32'] as NodeJS.Platform[]) {
      expect(resolveDoctorExecutable(project, undefined, () => false, platform)).not.toMatch(/npx/);
    }
  });
});

describe('the commands on offer', () => {
  it('are the ones doctor has, with nothing invented', () => {
    // Every first argument must be a real doctor command
    const real = new Set(['init', 'publish', 'workflow', 'version', 'setup', 'cleanup', 'status']);
    expect(DOCTOR_RUNS.every((run) => real.has(run.args[0]))).toBe(true);
  });

  it('only passes flags doctor accepts', () => {
    const flags = DOCTOR_RUNS.flatMap((run) => run.args.filter((a) => a.startsWith('--')));
    expect(flags).toEqual(['--forceAll']);
  });
});

describe('which certificate password is handed to doctor', () => {
  it('hands nothing over when doctor.json has its own — doctor reads that itself', () => {
    expect(
      passwordToHandOver({ inDoctorJson: 'in-file', setting: 'in-setting', stored: 'stored' })
    ).toBeUndefined();
  });

  it('hands over the setting before the stored one, the order the panel signs in with', () => {
    expect(passwordToHandOver({ setting: 'in-setting', stored: 'stored' })).toBe('in-setting');
  });

  it('hands over the stored password when nothing else is set', () => {
    // The case that was broken: the password the panel stored after asking
    expect(passwordToHandOver({ stored: 'stored' })).toBe('stored');
  });

  it('hands nothing over when there is none, so doctor asks in the terminal', () => {
    expect(passwordToHandOver({})).toBeUndefined();
  });

  it('treats an empty value as not set', () => {
    expect(passwordToHandOver({ inDoctorJson: '', setting: '', stored: 'stored' })).toBe('stored');
  });

  it('uses the variable doctor reads', () => {
    expect(CERTIFICATE_PASSWORD_ENV).toBe('DOCTOR_CERTIFICATE_PASSWORD');
  });
});
