import * as vscode from 'vscode';
import * as path from 'path';

type DefFileCallback = () => Array<string>;

export default class HoverProvider {

    constructor(private callback: DefFileCallback){

    }

    provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<any> {
            const wordPosition = document.getWordRangeAtPosition(position);
		    if (!wordPosition) {
                return new Promise((resolve) => resolve());
            }
            const word = document.getText(wordPosition);
          
            let file:number;
            let found:boolean;
            return new Promise((resolve, reject)=> {
                this.callback().forEach(element => {
                    vscode.workspace.openTextDocument(element).then((document) => {
                        for (let i = 0; i < document.lineCount; ++i) { 
                            const line = document.lineAt(i); 
                            
                            if (line.text.match(new RegExp('\\s*(@'+word+')(?:\\s+)'))) {

                                var regexp = /(@\w*)(?:[ \t]+)([\w.#]+)(?:[ \t]*)(\/\*[ \t\w]*)?/g;
                                var match = regexp.exec(line.text);
                                match?.forEach(element => {
                                    console.log(element);
                                });
                                
                                if (match?.[1] === undefined || match?.[2] === undefined) {
                                    resolve(new vscode.Hover(['No parameter definition found']));
                                    break;
                                }

                                let text = new vscode.MarkdownString('### Parameter definition\n\n', true);
                                text.appendMarkdown(`[${path.basename(document.fileName)}](${document.uri+'#'+(i+1)})\n\n`);
                                text.appendMarkdown('*'+`${match?.[1]}`+'* '+ '``'+`${match?.[2]}`+'``\n\n');

                                if (match?.[3] !== undefined) {
                                    text.appendCodeblock(`${match?.[3]}\n\n`);
                                }

                                resolve(new vscode.Hover([text]));
                                console.log(file);
                                found = true;
                                break;
                            }
                         } 
                      }).then(()=> {
                          if (!found) {
                              reject();
                          }
                      });
                });
            });
    }
}