namespace Rules

theorem firstMatch (accept : α → Bool) (before after : List α) (winner : α)
    (miss : ∀ x ∈ before, accept x = false) (hit : accept winner = true) :
    (before ++ winner :: after).find? accept = some winner := by
  induction before with
  | nil => simp [hit]
  | cons head tail ih =>
    have h := miss head (by simp)
    have rest : ∀ x ∈ tail, accept x = false := fun x hx => miss x (by simp [hx])
    simpa [List.find?, h] using ih rest

end Rules
