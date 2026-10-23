-- Lingo eval for the reference player. ref-start.sh installs it at launch (an instance
-- of this script, polled by a timeout every 200 ms). It reads ref-cmd.txt next to the
-- projector: a sequence number on the first line, Lingo after it. A new number runs
-- the Lingo with `do`; the Lingo sets the global gRefOut, which is written to
-- ref-out-<seq>.txt (a new file each time: FileIO's delete() can't be called here,
-- `delete` being a Lingo keyword). The game's own files are not modified.
property pSeq

on new me
  pSeq = EMPTY
  return me
end

on refpoll me
  global gRefOut
  f = new(xtra("fileio"))
  p = the applicationPath & "ref-cmd.txt"
  openFile(f, p, 1)
  if status(f) <> 0 then
    exit
  end if
  s = readFile(f)
  closeFile(f)
  if voidp(s) then
    exit
  end if
  seq = s.line[1]
  if (seq = EMPTY) or (seq = pSeq) then
    exit
  end if
  pSeq = seq
  s = s.line[2..s.line.count]
  gRefOut = "<no gRefOut>"
  do s
  o = new(xtra("fileio"))
  q = the applicationPath & "ref-out-" & seq & ".txt"
  createFile(o, q)
  openFile(o, q, 2)
  writeString(o, string(gRefOut))
  closeFile(o)
end
