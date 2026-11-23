---------------------------- MODULE Replay ----------------------------
EXTENDS Naturals, Sequences, FiniteSets
VARIABLES versions, trace, receipts
vars == <<versions, trace, receipts>>
Init == /\ versions = <<>>
        /\ trace = <<>>
        /\ receipts = {}
Put(value, key) ==
  /\ TRUE
  /\ Len(versions) < 3
  /\ versions' = IF Len(versions) = 0 THEN <<value>>
                 ELSE IF versions[Len(versions)] = value THEN versions
                      ELSE Append(versions, value)
  /\ receipts' = receipts \cup {key}
  /\ UNCHANGED trace
Record(i) ==
  /\ i \in 1..Len(versions)
  /\ Len(trace) < 2
  /\ trace' = Append(trace, <<i, versions[i]>>)
  /\ UNCHANGED <<versions, receipts>>
Next == (\E v \in {0,1}, k \in 1..3: Put(v,k)) \/ (\E i \in 1..3: Record(i)) \/ UNCHANGED vars
Spec == Init /\ [][Next]_vars
TraceReplays == \A i \in 1..Len(trace): versions[trace[i][1]] = trace[i][2]
OneVersionPerKey == Len(versions) <= Cardinality(receipts)
=============================================================================
