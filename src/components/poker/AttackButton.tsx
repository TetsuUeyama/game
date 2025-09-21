'use client';

import { Button } from '@chakra-ui/react';

interface AttackButtonProps {
  onAttack: () => void;
  disabled?: boolean;
  isPlayer?: boolean;
}

export const AttackButton = ({ onAttack, disabled = false, isPlayer = true }: AttackButtonProps) => {
  return (
    <Button
      onClick={onAttack}
      disabled={disabled}
      bg={isPlayer ? "blue.500" : "red.500"}
      color="white"
      _hover={{
        bg: isPlayer ? "blue.600" : "red.600",
      }}
      _disabled={{
        bg: "gray.400",
        cursor: "not-allowed",
      }}
      size="sm"
      fontWeight="bold"
    >
      {isPlayer ? "攻撃" : "敵攻撃"}
    </Button>
  );
};