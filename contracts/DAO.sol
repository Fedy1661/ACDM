//SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./Staking.sol";

contract DAO {
    uint256 private _voteCounter;

    Staking public immutable staking;
    address public immutable chairperson;
    address public immutable owner;
    uint256 public minimumQuorum;
    uint256 public debatingPeriodDuration;

    struct Proposal {
        address recipient;
        string description;
        uint256 finishAt;
        uint256 pros;
        uint256 cons;
        mapping(address => bool) voted;
        bytes callData;
        bool active;
    }

    mapping(uint256 => Proposal) private _proposals;
    mapping(address => uint256) private _electors; /// CanClaimAt

    event Vote(uint256 id, address elector, uint256 amount, bool support);
    event FinishProposal(uint256 id, uint256 pros, uint256 cons, uint256 total, bool status);
    event NewProposal(uint256 id, bytes signature, address recipient, string description, uint256 finishAt);

    modifier onlyOwner {
        require(msg.sender == owner, "Caller is not the owner");
        _;
    }

    /**
    * @dev Constructor
    * @param _chairperson Chairperson address
    * @param _staking Staking smart-contract address
    * @param _minimumQuorum Minimum tokens
    * @param _debatingPeriodDuration Seconds
    */
    constructor(
        address _chairperson,
        address _staking,
        uint256 _minimumQuorum,
        uint256 _debatingPeriodDuration
    ) {
        owner = msg.sender;
        chairperson = _chairperson;
        staking = Staking(_staking);
        minimumQuorum = _minimumQuorum;
        debatingPeriodDuration = _debatingPeriodDuration;
    }

    /**
    * @dev Cost a vote
    * @param _id Proposal ID
    * @param _support True or false
    */
    function vote(uint256 _id, bool _support) external {
        uint256 electorBalance = staking.balanceOf(msg.sender);
        require(electorBalance > 0, "You don't have tokens");

        Proposal storage proposal = _proposals[_id];
        uint256 finishAt = proposal.finishAt;
        require(finishAt >= block.timestamp, "Proposal is not active");
        require(!proposal.voted[msg.sender], "You've already done the voice");

        /// User can claim his own tokens after the end of the last proposal
        if (finishAt > _electors[msg.sender]) _electors[msg.sender] = finishAt;

        if (_support) proposal.pros = proposal.pros + electorBalance;
        else proposal.cons = proposal.cons + electorBalance;

        proposal.voted[msg.sender] = true;

        emit Vote(_id, msg.sender, electorBalance, _support);
    }

    function canClaimAt(address _elector) external view returns(uint256) {
        return _electors[_elector];
    }

    /**
    * @dev Add a new proposal
    * @param _callData Signature with arguments
    * @param _recipient Recipient address
    * @param _description Description
    */
    function addProposal(bytes calldata _callData, address _recipient, string calldata _description) external {
        require(msg.sender == chairperson, "Caller is not the chairperson");

        uint256 id = ++_voteCounter;

        Proposal storage proposal = _proposals[id];
        uint256 finishAt = block.timestamp + debatingPeriodDuration;
        proposal.finishAt = finishAt;
        proposal.description = _description;
        proposal.recipient = _recipient;
        proposal.callData = _callData;
        proposal.active = true;

        emit NewProposal(id, _callData, _recipient, _description, finishAt);
    }

    /**
    * @dev Finish the proposal and call function
    * @param _id Proposal ID
    */
    function finishProposal(uint256 _id) external {
        Proposal storage proposal = _proposals[_id];
        require(proposal.finishAt <= block.timestamp, "Debating period is not over");
        require(proposal.active, "Debate is over");

        uint256 pros = proposal.pros;
        uint256 cons = proposal.cons;
        uint256 total = pros + cons;
        bool success;

        if (total >= minimumQuorum && pros > cons) {
            (success,) = proposal.recipient.call(proposal.callData);
        }

        delete proposal.active;

        emit FinishProposal(_id, pros, cons, total, success);
    }

    /**
    * @dev Set minimum quorum
    * @param _amount Amount of quorum
    */
    function setMinimumQuorum(uint256 _amount) external onlyOwner {
        minimumQuorum = _amount;
    }

    /**
    * @dev Set debating period duration
    * @param _time Seconds
    */
    function setDebatingPeriodDuration(uint256 _time) external onlyOwner {
        debatingPeriodDuration = _time;
    }

}