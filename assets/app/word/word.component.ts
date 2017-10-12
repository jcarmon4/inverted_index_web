/**
 * Created by Alejocram on 11/10/2017.
 */
import { Component } from "@angular/core";
import {Word} from "./word.model";

@Component({
    selector: 'word',
    templateUrl: './word.component.html'
})
export class WordComponent {
    actualWord: Word = new Word('big data');
    actualWord1: Word = new Word('big data');
//    words: Word = [{actualWord1}, {actualWord1}];

    words: Word = <Word>[
        {name: 'Big'},
        {name: 'Data'}
    ];
}