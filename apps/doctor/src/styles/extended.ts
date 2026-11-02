/** Styles for the extended markdown syntax */
export const extendedCss = `mark {
  background-color: #fff100;
  color: #000;
  padding: 0 0.2em;
}

dl dt {
  font-weight: bold;
  margin-top: 0.5rem;
}

dl dd {
  margin: 0 0 0.5rem 1.5rem;
}

.contains-task-list {
  list-style: none;
  padding-left: 1.2em;
}

.task-list-item {
  position: relative;
}

.task-list-item-checkbox {
  position: absolute;
  left: -1.2em;
  top: 0.3em;
  margin: 0;
}

.footnotes {
  font-size: 0.9em;
}

.footnotes-sep {
  margin-top: 2rem;
  border: 0;
  border-top: 1px solid #eaeaea;
}

.footnote-backref {
  text-decoration: none;
}`;
