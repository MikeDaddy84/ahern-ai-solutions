import * as chai from 'chai';
import { JestChaiExpect, JestAsymmetricMatchers, type ExpectStatic } from '@vitest/expect';

chai.use(JestChaiExpect);
chai.use(JestAsymmetricMatchers);
export const expect = chai.expect as unknown as ExpectStatic;
