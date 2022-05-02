// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


interface IDAO {
    function canClaimAt(address _elector) external view returns(uint256);
}