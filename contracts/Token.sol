// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Token is Ownable {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    event Transfer(address indexed _from, address indexed _to, uint256 _value);
    event Approval(address indexed _owner, address indexed _spender, uint256 _value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals, uint256 _totalSupply) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        totalSupply = _totalSupply;
        _balances[msg.sender] = _totalSupply;
    }

    function balanceOf(address _owner) public view returns (uint256) {
        return _balances[_owner];
    }

    function _transfer(address _from, address _to, uint256 _value) internal {
        require(_value > 0, 'Value should be positive');
        require(_from != _to, 'You cannot transfer to yourself');
        uint256 fromValue = _balances[_from];
        require(fromValue >= _value, 'Not enough tokens');

        _balances[_to] += _value;
        _balances[_from] = fromValue - _value;
        emit Transfer(msg.sender, _to, _value);
    }

    function transfer(address _to, uint256 _value) public returns (bool) {
        _transfer(msg.sender, _to, _value);
        return true;
    }

    function transferFrom(address _from, address _to, uint256 _value) public returns (bool) {
        uint256 availableValue = _allowances[_from][msg.sender];
        require(availableValue >= _value, 'You can\'t transfer so tokens from this user');

        _allowances[_from][msg.sender] = availableValue - _value;
        _transfer(_from, _to, _value);
        return true;
    }

    function approve(address _spender, uint256 _value) public returns (bool) {
        require(_value > 0, 'Value should be positive');
        _allowances[msg.sender][_spender] = _value;
        emit Approval(msg.sender, _spender, _value);
        return true;
    }

    function allowance(address _owner, address _spender) public view returns (uint256) {
        return _allowances[_owner][_spender];
    }

    function burn(address _account, uint256 _amount) public onlyOwner returns (bool) {
        require(_amount > 0, 'Amount should be positive');
        unchecked {
            _balances[_account] -= _amount;
            totalSupply -= _amount;
        }
        emit Transfer(msg.sender, _account, _amount);
        return true;
    }

    function mint(address _account, uint256 _amount) public onlyOwner returns (bool) {
        require(_amount > 0, 'Amount should be positive');
        _balances[_account] += _amount;
        totalSupply += _amount;
        emit Transfer(msg.sender, _account, _amount);
        return true;
    }

}