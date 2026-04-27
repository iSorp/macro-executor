import * as l10n from '@vscode/l10n';
import { URI } from 'vscode-uri';

const bundleUri = process.env.L10N_BUNDLE;
if (bundleUri) {
    const fileUri = URI.parse(bundleUri);
    l10n.config({ uri: new URL(fileUri.toString()) });
} 

export function localize(messageKey: string, defaultMessage: string) {
    const message = l10n.t(messageKey);
     return message === messageKey ? defaultMessage : message;
}
